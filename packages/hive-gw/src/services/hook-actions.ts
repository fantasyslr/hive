import type { HiveEvent } from '@hive/shared';
import type { ActionHandler } from './hook-engine.js';
import type { TaskMachine } from './task-machine.js';
import type { MemoryService } from './memory-service.js';
import { logger } from '../config.js';

/* ── Template variable resolution ────────────────────────────── */

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

export function resolveTemplateVars(template: string, data: Record<string, unknown>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
    const value = resolvePath(data, path);
    return value !== undefined ? String(value) : '';
  });
}

/* ── HttpAction ──────────────────────────────────────────────── */

export class HttpAction implements ActionHandler {
  async execute(event: HiveEvent, params: Record<string, unknown>): Promise<void> {
    const url = params.url as string;
    if (!url) {
      logger.warn('HttpAction: missing url param');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event.data),
        signal: controller.signal,
      });
    } catch (err) {
      logger.warn({ err, url }, 'HttpAction failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

/* ── CreateTaskAction ────────────────────────────────────────── */

export class CreateTaskAction implements ActionHandler {
  constructor(private tm: TaskMachine) {}

  async execute(event: HiveEvent, params: Record<string, unknown>): Promise<void> {
    const data = event.data as Record<string, unknown>;
    const title = resolveTemplateVars(String(params.title ?? ''), data);
    const description = resolveTemplateVars(String(params.description ?? ''), data);
    const taskKind = String(params.taskKind ?? 'execute');
    const requiredCapabilities = (params.requiredCapabilities as string[]) ?? [];
    this.tm.create({
      title,
      description,
      requiredCapabilities,
      createdBy: 'hook-engine',
      taskKind,
      parentTaskId: data.taskId as string | undefined,
    });
  }
}

/* ── MemorySearchAction ──────────────────────────────────────── */

export class MemorySearchAction implements ActionHandler {
  constructor(private memoryService: MemoryService) {}

  async execute(event: HiveEvent, params: Record<string, unknown>): Promise<void> {
    const query = resolveTemplateVars(String(params.query ?? ''), event.data as Record<string, unknown>);
    if (!query) {
      logger.warn('MemorySearchAction: empty query');
      return;
    }
    const results = await this.memoryService.search(query, {
      namespace: params.namespace as string | undefined,
      limit: (params.limit as number) ?? 3,
    });
    logger.info(
      { query, resultCount: Array.isArray(results) ? results.length : 0 },
      'MemorySearchAction completed',
    );
  }
}
