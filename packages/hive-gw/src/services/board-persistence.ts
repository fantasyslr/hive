import type { BoardSnapshot } from '@hive/shared';
import { MEMORY_NAMESPACES, SNAPSHOT_DEBOUNCE_MS } from '@hive/shared';
import type { MemoryClient } from './memory-client.js';
import type { MemoryService } from './memory-service.js';
import type { EventBus } from './event-bus.js';
import type { AgentRegistry } from './registry.js';
import type { TaskMachine } from './task-machine.js';
import { logger } from '../config.js';

const SNAPSHOT_TITLE = `${MEMORY_NAMESPACES.PUBLIC_BOARD}/snapshot`;

export class BoardPersistence {
  private client: MemoryClient;
  private bus: EventBus;
  private registry: AgentRegistry;
  private tasks: TaskMachine;
  private memoryService: MemoryService;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private toolNames: { add: string; search: string } | null = null;

  constructor(
    client: MemoryClient,
    bus: EventBus,
    registry: AgentRegistry,
    tasks: TaskMachine,
    memoryService: MemoryService,
  ) {
    this.client = client;
    this.bus = bus;
    this.registry = registry;
    this.tasks = tasks;
    this.memoryService = memoryService;
  }

  /** Initialize board persistence — reuses tool names from MemoryService (no redundant discovery) */
  init(): void {
    const names = this.memoryService.getToolNames();
    if (names) {
      this.toolNames = { add: names.add, search: names.search };
      this.ready = true;
      logger.info('BoardPersistence initialized — using cached tool names from MemoryService');
    } else {
      this.ready = false;
      logger.warn('BoardPersistence running in degraded mode — MemoryService has no tool names');
    }
  }

  /** Load the most recent board snapshot from Nowledge Mem. Returns true if recovery succeeded. */
  async loadSnapshot(): Promise<boolean> {
    if (!this.ready || !this.toolNames) {
      logger.warn('BoardPersistence not ready — skipping snapshot load');
      return false;
    }

    try {
      await this.client.ensureConnected();
    } catch {
      logger.warn('Nowledge Mem unavailable — starting without recovery');
      return false;
    }

    try {
      const result = await this.client.callTool(this.toolNames.search, {
        query: SNAPSHOT_TITLE,
        limit: 1,
      });

      // Parse the search result — Nowledge Mem returns an array of content blocks
      const snapshot = this.parseSnapshotResult(result);
      if (!snapshot) {
        logger.info('No board snapshot found — starting fresh');
        return false;
      }

      // Restore agents — all marked offline (wait for re-registration)
      for (const agent of snapshot.agents) {
        this.registry.register(agent);
        this.registry.markOffline(agent.agent_id);
      }

      // Restore tasks — bypass state transition validation
      for (const task of snapshot.tasks) {
        this.tasks.restore(task);
      }

      logger.info(
        { agents: snapshot.agents.length, tasks: snapshot.tasks.length, snapshotTime: snapshot.timestamp },
        `Board restored: ${snapshot.agents.length} agents (all offline), ${snapshot.tasks.length} tasks`,
      );
      return true;
    } catch (err) {
      logger.warn({ err }, 'Failed to load board snapshot — starting fresh');
      return false;
    }
  }

  /** Debounced persist — schedules a snapshot write after SNAPSHOT_DEBOUNCE_MS */
  schedulePersist(): void {
    if (!this.ready || !this.toolNames) return;

    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
    }

    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.persistNow().catch((err) => {
        logger.error({ err }, 'Board snapshot persist failed');
      });
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  /** Register event hooks — any state change triggers debounced snapshot write */
  registerHooks(): void {
    const stateEvents = [
      'task.assigned',
      'task.updated',
      'task.completed',
      'task.failed',
      'agent.online',
      'agent.offline',
    ] as const;

    for (const eventType of stateEvents) {
      this.bus.on(eventType, () => this.schedulePersist());
    }

    logger.info('BoardPersistence hooks registered for state change events');
  }

  /** Immediately persist current board state to Nowledge Mem */
  private async persistNow(): Promise<void> {
    if (!this.toolNames) return;

    const snapshot: BoardSnapshot = {
      agents: this.registry.getAll(),
      tasks: this.tasks.getAll(),
      timestamp: new Date().toISOString(),
    };

    await this.client.callTool(this.toolNames.add, {
      content: JSON.stringify(snapshot),
      title: SNAPSHOT_TITLE,
    });

    logger.info(
      { agents: snapshot.agents.length, tasks: snapshot.tasks.length },
      'Board snapshot persisted to Nowledge Mem',
    );
  }

  /** Parse search result from Nowledge Mem into a BoardSnapshot */
  private parseSnapshotResult(result: unknown): BoardSnapshot | null {
    try {
      // Nowledge Mem search returns an array of content blocks: [{type: 'text', text: '...'}]
      if (Array.isArray(result) && result.length > 0) {
        const textBlock = result.find(
          (block: Record<string, unknown>) => block.type === 'text' && typeof block.text === 'string',
        );
        if (textBlock) {
          const parsed = JSON.parse(textBlock.text as string);
          // Could be a direct BoardSnapshot or wrapped in search results
          if (parsed.agents && parsed.tasks && parsed.timestamp) {
            return parsed as BoardSnapshot;
          }
          // If search returns a list of results, find the most recent snapshot
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const content = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
              if (content?.agents && content?.tasks && content?.timestamp) {
                return content as BoardSnapshot;
              }
            }
          }
        }
      }
      // If result is a string directly
      if (typeof result === 'string') {
        const parsed = JSON.parse(result);
        if (parsed.agents && parsed.tasks && parsed.timestamp) {
          return parsed as BoardSnapshot;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
