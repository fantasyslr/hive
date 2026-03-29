import type { Task, MemoryConclusion } from '@hive/shared';
import { MEMORY_NAMESPACES } from '@hive/shared';
import type { MemoryClient } from './memory-client.js';
import type { EventBus } from './event-bus.js';
import type { TaskMachine } from './task-machine.js';
import { logger } from '../config.js';

interface ToolNames {
  add: string;
  search: string;
  update?: string;
}

export class MemoryService {
  private client: MemoryClient;
  private bus: EventBus;
  private tasks: TaskMachine;
  private toolNames: ToolNames | null = null;
  private ready = false;

  constructor(client: MemoryClient, bus: EventBus, tasks: TaskMachine) {
    this.client = client;
    this.bus = bus;
    this.tasks = tasks;
  }

  async init(): Promise<boolean> {
    try {
      await this.client.ensureConnected();
      const tools = await this.client.listTools();
      logger.info({ tools: tools.map((t) => t.name) }, 'Discovered Nowledge Mem tools');

      const addTool = tools.find((t) => t.name === 'memory_add');
      const searchTool = tools.find((t) => t.name === 'memory_search');

      if (!addTool || !searchTool) {
        logger.warn(
          { found: tools.map((t) => t.name) },
          'Required tools (memory_add, memory_search) not found — degraded mode',
        );
        this.ready = false;
        return false;
      }

      const updateTool = tools.find((t) => t.name === 'memory_update');
      this.toolNames = {
        add: addTool.name,
        search: searchTool.name,
        update: updateTool?.name,
      };
      this.ready = true;
      logger.info({ toolNames: this.toolNames }, 'MemoryService initialized');
      return true;
    } catch (err) {
      logger.warn({ err }, 'MemoryService running in degraded mode — Nowledge Mem unavailable');
      this.ready = false;
      return false;
    }
  }

  getToolNames(): ToolNames | null {
    return this.toolNames;
  }

  isReady(): boolean {
    return this.ready;
  }

  async writeConclusion(task: Task): Promise<string | null> {
    if (!this.ready || !this.toolNames) return null;

    const namespace = `${MEMORY_NAMESPACES.PUBLIC_CONCLUSIONS}/${task.id}`;
    const conclusion: MemoryConclusion = {
      task_id: task.id,
      agent_id: task.assignee ?? 'unknown',
      conclusion: task.result ?? '',
      decision_reason: '',
      impact_scope: '',
      timestamp: new Date().toISOString(),
      namespace,
    };

    try {
      await this.client.callTool(this.toolNames.add, {
        content: JSON.stringify(conclusion),
        title: namespace,
      });

      this.bus.emit({
        type: 'memory.updated',
        data: { namespace: MEMORY_NAMESPACES.PUBLIC_CONCLUSIONS, task_id: task.id },
      });

      const ref = `mem://${namespace}`;
      logger.info({ taskId: task.id, ref }, 'Conclusion written to memory');
      return ref;
    } catch (err) {
      logger.error({ err, taskId: task.id }, 'Failed to write conclusion to memory');
      return null;
    }
  }

  async writeProcess(task: Task, agentId: string): Promise<string | null> {
    if (!this.ready || !this.toolNames) return null;

    const namespace = `${MEMORY_NAMESPACES.AGENT_PREFIX}/${agentId}/${task.id}`;

    try {
      await this.client.callTool(this.toolNames.add, {
        content: JSON.stringify({
          task_id: task.id,
          agent_id: agentId,
          status: task.status,
          result: task.result,
          error: task.error,
          timestamp: new Date().toISOString(),
        }),
        title: namespace,
      });

      const ref = `mem://${namespace}`;
      return ref;
    } catch (err) {
      logger.error({ err, taskId: task.id, agentId }, 'Failed to write process to memory');
      return null;
    }
  }

  async search(query: string, namespace: string = 'public', limit: number = 10): Promise<unknown> {
    if (!this.ready || !this.toolNames) return [];

    try {
      const result = await this.client.callTool(this.toolNames.search, {
        query,
        limit,
      });
      return result;
    } catch (err) {
      logger.error({ err, query, namespace }, 'Memory search failed');
      return [];
    }
  }

  registerHooks(): void {
    this.bus.on('task.completed', (event) => {
      const task = this.tasks.get(event.data.task_id as string);
      if (!task || !task.assignee) return;

      // Fire and forget — do not await in emit path
      this.writeConclusion(task)
        .then((ref) => {
          if (ref) {
            // APPEND to existing output_refs (do not replace — PATCH route may also set refs)
            const updated = this.tasks.appendOutputRefs(task.id, [ref]);
            if (updated) {
              this.bus.emit({
                type: 'task.updated',
                data: {
                  task_id: updated.id,
                  agent_id: updated.assignee,
                  status: updated.status,
                  version: updated.version,
                  output_refs: updated.output_refs ?? [],
                },
              });
            }
          }
        })
        .catch((err) => logger.error({ err, taskId: task.id }, 'Failed to write conclusion'));

      this.writeProcess(task, task.assignee).catch((err) =>
        logger.error({ err, taskId: task.id }, 'Failed to write process'),
      );
    });

    this.bus.on('task.failed', (event) => {
      const task = this.tasks.get(event.data.task_id as string);
      if (!task || !task.assignee) return;

      // Fire and forget
      this.writeProcess(task, task.assignee).catch((err) =>
        logger.error({ err, taskId: task.id }, 'Failed to write process on failure'),
      );
    });

    logger.info('MemoryService hooks registered for task.completed and task.failed');
  }
}
