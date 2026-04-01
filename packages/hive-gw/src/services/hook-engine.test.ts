import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  evaluateCondition,
  HooksConfigSchema,
  HookDefinitionSchema,
  HookEngine,
  type ActionHandler,
  type HookCondition,
} from './hook-engine.js';
import type { HiveEvent } from '@hive/shared';

/* ── helpers ─────────────────────────────────────────────────── */

function makeMockBus() {
  const listeners = new Map<string, Set<(event: HiveEvent) => void>>();
  return {
    on: vi.fn((type: string, handler: (event: HiveEvent) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    }),
    off: vi.fn((type: string, handler: (event: HiveEvent) => void) => {
      listeners.get(type)?.delete(handler);
    }),
    emit(event: Omit<HiveEvent, 'id' | 'timestamp'>): HiveEvent {
      const full: HiveEvent = { ...event, id: 1, timestamp: new Date().toISOString() } as HiveEvent;
      const handlers = listeners.get(full.type);
      if (handlers) for (const h of handlers) h(full);
      return full;
    },
  };
}

function makeMockHandler(): ActionHandler {
  return { execute: vi.fn().mockResolvedValue(undefined) };
}

/* ── evaluateCondition ───────────────────────────────────────── */

describe('evaluateCondition', () => {
  it('returns true when condition is undefined', () => {
    expect(evaluateCondition(undefined, { x: 1 })).toBe(true);
  });

  it('eq: matches equal value', () => {
    expect(evaluateCondition({ field: 'task.taskKind', eq: 'execute' }, { task: { taskKind: 'execute' } })).toBe(true);
  });

  it('eq: rejects non-equal value', () => {
    expect(evaluateCondition({ field: 'task.taskKind', eq: 'execute' }, { task: { taskKind: 'plan' } })).toBe(false);
  });

  it('neq: matches when value differs', () => {
    expect(evaluateCondition({ field: 'task.taskKind', neq: 'coordinate' }, { task: { taskKind: 'execute' } })).toBe(true);
  });

  it('in: matches value in array', () => {
    expect(evaluateCondition({ field: 'task.taskKind', in: ['execute', 'plan'] }, { task: { taskKind: 'plan' } })).toBe(true);
  });

  it('in: rejects value not in array', () => {
    expect(evaluateCondition({ field: 'task.taskKind', in: ['execute', 'plan'] }, { task: { taskKind: 'fix' } })).toBe(false);
  });

  it('exists true: matches when field present', () => {
    expect(evaluateCondition({ field: 'task.assignee', exists: true }, { task: { assignee: 'agent-1' } })).toBe(true);
  });

  it('exists true: rejects when field missing', () => {
    expect(evaluateCondition({ field: 'task.assignee', exists: true }, { task: {} })).toBe(false);
  });

  it('resolves nested dot-path fields', () => {
    expect(evaluateCondition({ field: 'a.b.c', eq: 42 }, { a: { b: { c: 42 } } })).toBe(true);
  });

  it('returns false for missing path with eq', () => {
    expect(evaluateCondition({ field: 'a.b.missing', eq: 'x' }, { a: { b: {} } })).toBe(false);
  });
});

/* ── Zod schema validation ───────────────────────────────────── */

describe('HooksConfigSchema', () => {
  it('accepts valid config with action', () => {
    const result = HooksConfigSchema.safeParse({
      hooks: [{ on: 'task.completed', action: { type: 'http', params: { url: 'https://x.com' } } }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects config missing action', () => {
    const result = HooksConfigSchema.safeParse({
      hooks: [{ on: 'task.completed' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts config with optional if condition', () => {
    const result = HooksConfigSchema.safeParse({
      hooks: [{ on: 'task.completed', if: { field: 'x', eq: 'y' }, action: { type: 'http', params: {} } }],
    });
    expect(result.success).toBe(true);
  });
});

/* ── HookEngine ──────────────────────────────────────────────── */

describe('HookEngine', () => {
  let bus: ReturnType<typeof makeMockBus>;
  let handler: ActionHandler;
  let engine: HookEngine;

  beforeEach(() => {
    bus = makeMockBus();
    handler = makeMockHandler();
    engine = new HookEngine(bus as any, { http: handler });
  });

  it('loadConfig returns ok:true for valid config', () => {
    const result = engine.loadConfig({
      hooks: [{ on: 'task.completed', action: { type: 'http', params: { url: 'https://x.com' } } }],
    });
    expect(result.ok).toBe(true);
  });

  it('loadConfig returns ok:false for invalid config', () => {
    const result = engine.loadConfig({ hooks: [{ on: 'task.completed' }] });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('dispatches matching action handler on event', async () => {
    engine.loadConfig({
      hooks: [{ on: 'task.completed', action: { type: 'http', params: { url: 'https://x.com' } } }],
    });

    bus.emit({ type: 'task.completed', data: { taskId: '123' } });

    // handler.execute is async, give microtask a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect((handler.execute as any).mock.calls[0][1]).toEqual({ url: 'https://x.com' });
  });

  it('does NOT dispatch when condition does not match', async () => {
    engine.loadConfig({
      hooks: [{
        on: 'task.completed',
        if: { field: 'taskKind', eq: 'coordinate' },
        action: { type: 'http', params: {} },
      }],
    });

    bus.emit({ type: 'task.completed', data: { taskKind: 'execute' } });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler.execute).not.toHaveBeenCalled();
  });

  it('dispatches when condition matches', async () => {
    engine.loadConfig({
      hooks: [{
        on: 'task.completed',
        if: { field: 'taskKind', eq: 'execute' },
        action: { type: 'http', params: { notify: true } },
      }],
    });

    bus.emit({ type: 'task.completed', data: { taskKind: 'execute' } });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps previous hooks on failed loadConfig', () => {
    engine.loadConfig({
      hooks: [{ on: 'task.completed', action: { type: 'http', params: {} } }],
    });

    // Load invalid config — should fail
    const result = engine.loadConfig({ hooks: [{ bad: true }] });
    expect(result.ok).toBe(false);

    // Previous hook should still fire
    bus.emit({ type: 'task.completed', data: {} });
    // Give async dispatch a tick
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(handler.execute).toHaveBeenCalledTimes(1);
        resolve();
      }, 10);
    });
  });

  it('registerHooks is a no-op (service pattern compat)', () => {
    expect(() => engine.registerHooks()).not.toThrow();
  });
});
