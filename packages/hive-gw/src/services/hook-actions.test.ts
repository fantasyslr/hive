import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { HiveEvent } from '@hive/shared';
import {
  resolveTemplateVars,
  HttpAction,
  CreateTaskAction,
  MemorySearchAction,
} from './hook-actions.js';

/* ── resolveTemplateVars ─────────────────────────────────────── */

describe('resolveTemplateVars', () => {
  it('resolves simple dot path', () => {
    expect(resolveTemplateVars('Follow-up for ${task.title}', { task: { title: 'Deploy', id: 't1' } }))
      .toBe('Follow-up for Deploy');
  });

  it('resolves nested path', () => {
    expect(resolveTemplateVars('Task ${task.id} done', { task: { id: 'abc' } }))
      .toBe('Task abc done');
  });

  it('returns string unchanged when no vars', () => {
    expect(resolveTemplateVars('No vars here', {})).toBe('No vars here');
  });

  it('replaces missing path with empty string', () => {
    expect(resolveTemplateVars('Missing ${task.foo}', { task: {} }))
      .toBe('Missing ');
  });

  it('resolves multiple vars in one string', () => {
    expect(resolveTemplateVars('${a} and ${b}', { a: 'X', b: 'Y' }))
      .toBe('X and Y');
  });
});

/* ── HttpAction ──────────────────────────────────────────────── */

describe('HttpAction', () => {
  let action: HttpAction;
  const mockEvent: HiveEvent = {
    id: 1,
    type: 'task.completed',
    data: { taskId: 't1', status: 'done' },
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    action = new HttpAction();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs event data to the configured URL', async () => {
    await action.execute(mockEvent, { url: 'https://example.com/hook' });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual(mockEvent.data);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not throw on network error', async () => {
    (fetch as any).mockRejectedValue(new Error('network down'));

    await expect(action.execute(mockEvent, { url: 'https://example.com/hook' }))
      .resolves.toBeUndefined();
  });

  it('does not throw when url is missing', async () => {
    await expect(action.execute(mockEvent, {})).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

/* ── CreateTaskAction ────────────────────────────────────────── */

describe('CreateTaskAction', () => {
  const mockTm = {
    create: vi.fn().mockReturnValue({ id: 'new-task' }),
  };

  let action: CreateTaskAction;

  beforeEach(() => {
    mockTm.create.mockClear();
    action = new CreateTaskAction(mockTm as any);
  });

  it('creates a task with template-resolved title and description', async () => {
    const event: HiveEvent = {
      id: 2,
      type: 'task.completed',
      data: { task: { title: 'Deploy v2', id: 't1' }, taskId: 't1' },
      timestamp: new Date().toISOString(),
    };

    await action.execute(event, {
      title: 'Follow-up for ${task.title}',
      description: 'Auto-created from ${task.id}',
      taskKind: 'execute',
      requiredCapabilities: ['code'],
    });

    expect(mockTm.create).toHaveBeenCalledOnce();
    const args = mockTm.create.mock.calls[0][0];
    expect(args.title).toBe('Follow-up for Deploy v2');
    expect(args.description).toBe('Auto-created from t1');
    expect(args.taskKind).toBe('execute');
    expect(args.requiredCapabilities).toEqual(['code']);
    expect(args.createdBy).toBe('hook-engine');
    expect(args.parentTaskId).toBe('t1');
  });

  it('uses defaults for missing optional params', async () => {
    const event: HiveEvent = {
      id: 3, type: 'task.completed',
      data: { taskId: 't2' },
      timestamp: new Date().toISOString(),
    };

    await action.execute(event, { title: 'Simple task' });

    const args = mockTm.create.mock.calls[0][0];
    expect(args.title).toBe('Simple task');
    expect(args.taskKind).toBe('execute');
    expect(args.requiredCapabilities).toEqual([]);
  });
});

/* ── MemorySearchAction ──────────────────────────────────────── */

describe('MemorySearchAction', () => {
  const mockMemoryService = {
    search: vi.fn().mockResolvedValue([{ id: 'm1' }]),
  };

  let action: MemorySearchAction;

  beforeEach(() => {
    mockMemoryService.search.mockClear();
    action = new MemorySearchAction(mockMemoryService as any);
  });

  it('searches with template-resolved query', async () => {
    const event: HiveEvent = {
      id: 4, type: 'task.completed',
      data: { task: { title: 'Deploy' } },
      timestamp: new Date().toISOString(),
    };

    await action.execute(event, { query: 'related to ${task.title}', limit: 5 });

    expect(mockMemoryService.search).toHaveBeenCalledOnce();
    const [query, opts] = mockMemoryService.search.mock.calls[0];
    expect(query).toBe('related to Deploy');
    expect(opts.limit).toBe(5);
  });

  it('does not search when query resolves to empty', async () => {
    const event: HiveEvent = {
      id: 5, type: 'task.completed',
      data: {},
      timestamp: new Date().toISOString(),
    };

    await action.execute(event, { query: '' });
    expect(mockMemoryService.search).not.toHaveBeenCalled();
  });

  it('passes namespace when provided', async () => {
    const event: HiveEvent = {
      id: 6, type: 'task.completed',
      data: { keyword: 'deploy' },
      timestamp: new Date().toISOString(),
    };

    await action.execute(event, { query: '${keyword}', namespace: 'public', limit: 2 });

    const [, opts] = mockMemoryService.search.mock.calls[0];
    expect(opts.namespace).toBe('public');
    expect(opts.limit).toBe(2);
  });
});
