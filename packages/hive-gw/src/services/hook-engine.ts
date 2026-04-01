import { z } from 'zod/v4';
import type { HiveEvent } from '@hive/shared';
import type { EventBus } from './event-bus.js';
import { logger } from '../config.js';

/* ── Zod schemas ─────────────────────────────────────────────── */

export const ConditionSchema = z.object({
  field: z.string(),
  eq: z.unknown().optional(),
  neq: z.unknown().optional(),
  in: z.array(z.unknown()).optional(),
  exists: z.boolean().optional(),
});

export const ActionSchema = z.object({
  type: z.string(),
  params: z.record(z.string(), z.unknown()),
});

export const HookDefinitionSchema = z.object({
  on: z.string(),
  if: ConditionSchema.optional(),
  action: ActionSchema,
});

export const HooksConfigSchema = z.object({
  hooks: z.array(HookDefinitionSchema),
});

/* ── Inferred types ──────────────────────────────────────────── */

export type HookDefinition = z.infer<typeof HookDefinitionSchema>;
export type HookCondition = z.infer<typeof ConditionSchema>;
export type HookAction = z.infer<typeof ActionSchema>;

/* ── ActionHandler interface ─────────────────────────────────── */

export interface ActionHandler {
  execute(event: HiveEvent, params: Record<string, unknown>): Promise<void>;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/* ── Condition evaluator ─────────────────────────────────────── */

export function evaluateCondition(
  condition: HookCondition | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  const value = resolvePath(data, condition.field);

  if (condition.eq !== undefined) {
    return value === condition.eq;
  }
  if (condition.neq !== undefined) {
    return value !== condition.neq;
  }
  if (condition.in !== undefined) {
    return Array.isArray(condition.in) && condition.in.includes(value);
  }
  if (condition.exists !== undefined) {
    return condition.exists ? value !== undefined : value === undefined;
  }

  return true;
}

/* ── HookEngine ──────────────────────────────────────────────── */

export class HookEngine {
  private hooks: HookDefinition[] = [];
  private handlers = new Map<string, ActionHandler>();
  private boundListeners = new Map<string, (event: HiveEvent) => void>();

  constructor(
    private bus: EventBus,
    handlers: Record<string, ActionHandler>,
  ) {
    for (const [type, handler] of Object.entries(handlers)) {
      this.handlers.set(type, handler);
    }
  }

  loadConfig(raw: unknown): { ok: boolean; error?: string } {
    const result = HooksConfigSchema.safeParse(raw);
    if (!result.success) {
      return { ok: false, error: result.error.message };
    }
    this.hooks = result.data.hooks;
    this.resubscribe();
    return { ok: true };
  }

  private resubscribe(): void {
    // Remove all existing listeners
    for (const [eventType, handler] of this.boundListeners) {
      this.bus.off(eventType, handler);
    }
    this.boundListeners.clear();

    // Collect unique event types
    const eventTypes = new Set(this.hooks.map((h) => h.on));

    for (const eventType of eventTypes) {
      const handler = (event: HiveEvent): void => {
        const matching = this.hooks.filter(
          (h) => h.on === eventType && evaluateCondition(h.if, event.data),
        );
        for (const hook of matching) {
          this.dispatch(hook, event).catch(() => {
            // errors logged inside dispatch
          });
        }
      };
      this.boundListeners.set(eventType, handler);
      this.bus.on(eventType, handler);
    }
  }

  private async dispatch(hook: HookDefinition, event: HiveEvent): Promise<void> {
    const handler = this.handlers.get(hook.action.type);
    if (!handler) {
      logger.warn({ actionType: hook.action.type }, 'No handler registered for action type');
      return;
    }
    try {
      await handler.execute(event, hook.action.params);
    } catch (err) {
      logger.error({ err, actionType: hook.action.type, eventType: event.type }, 'Hook action handler failed');
    }
  }

  registerHooks(): void {
    logger.info('HookEngine ready');
  }
}
