import type { TaskMachine } from './task-machine.js';
import type { EventBus } from './event-bus.js';
import type { Dispatcher } from './dispatcher.js';
import { logger } from '../config.js';

/** Minimal LLM client interface — matches history-injector pattern */
export interface LlmClient {
  query(prompt: string): Promise<string>;
}

interface DecomposedTask {
  title: string;
  description: string;
  taskKind?: string;
  requiredCapabilities: string[];
  dependsOn?: string[]; // title references
}

const DECOMPOSE_PROMPT = `You are a task decomposition agent. Given a complex goal, break it into 2-7 concrete sub-tasks that can be assigned to AI workers.

Goal: {title}
Description: {description}

Return ONLY a JSON array (no markdown, no explanation):
[{"title":"...","description":"...","taskKind":"execute","requiredCapabilities":["..."],"dependsOn":["Title of dependency"]}]

Rules:
- Each sub-task should be independently completable by one agent
- Use dependsOn to express ordering (reference other sub-task titles)
- taskKind should be "execute", "explore", "review", or "plan"
- requiredCapabilities should match the task's domain`;

export class CoordinatorService {
  constructor(
    private tm: TaskMachine,
    private bus: EventBus,
    private dispatcher: Dispatcher,
    private llmClient: LlmClient | null = null,
  ) {}

  registerHooks(): void {
    this.bus.on('task.assigned', (event) => {
      const taskId = event.data.taskId as string;
      if (!taskId) return;
      const task = this.tm.get(taskId);
      if (!task || task.taskKind !== 'coordinate') return;
      // Fire-and-forget async (same pattern as other hooks)
      this.decompose(taskId).catch((err) => {
        logger.error({ err, taskId }, 'Coordinator decomposition failed');
      });
    });
    logger.info('CoordinatorService hooks registered');
  }

  async decompose(taskId: string): Promise<void> {
    const task = this.tm.get(taskId);
    if (!task) return;

    if (!this.llmClient) {
      logger.warn({ taskId }, 'No LLM client configured — coordinate task stays claimed for manual handling');
      return;
    }

    // 1. Call LLM to decompose
    const prompt = DECOMPOSE_PROMPT
      .replace('{title}', task.title)
      .replace('{description}', task.description);

    let rawResponse: string;
    try {
      rawResponse = await this.llmClient.query(prompt);
    } catch (err) {
      logger.warn({ err, taskId }, 'LLM decomposition failed — task stays claimed for manual handling');
      return;
    }

    // 2. Parse JSON response
    let decomposed: DecomposedTask[];
    try {
      decomposed = JSON.parse(rawResponse);
      if (!Array.isArray(decomposed)) {
        throw new Error('Response is not an array');
      }
    } catch (err) {
      logger.warn({ err, taskId, rawResponse }, 'Failed to parse LLM decomposition response');
      return;
    }

    // 3. Validate — each must have title and requiredCapabilities
    decomposed = decomposed.filter(d =>
      d.title && Array.isArray(d.requiredCapabilities) && d.requiredCapabilities.length > 0,
    );
    if (decomposed.length === 0) {
      logger.warn({ taskId }, 'LLM returned no valid sub-tasks');
      return;
    }

    // 4. Create sub-tasks — first pass: build titleToId map
    const titleToId = new Map<string, string>();
    for (const sub of decomposed) {
      const created = this.tm.create({
        title: sub.title,
        description: sub.description ?? '',
        requiredCapabilities: sub.requiredCapabilities,
        createdBy: 'coordinator',
        taskKind: sub.taskKind ?? 'execute',
        parentTaskId: task.id,
        runId: task.runId ?? task.id,
      });
      titleToId.set(sub.title, created.id);
    }

    // 5. Second pass: resolve dependsOn titles to IDs
    for (const sub of decomposed) {
      if (!sub.dependsOn?.length) continue;
      const depIds = sub.dependsOn
        .map(title => titleToId.get(title))
        .filter((id): id is string => id !== undefined);
      if (depIds.length > 0) {
        const subId = titleToId.get(sub.title)!;
        this.tm.setDependsOn(subId, depIds);
      }
    }

    // 6. Transition coordinate task to 'working'
    const current = this.tm.get(taskId);
    if (current && current.status === 'claimed') {
      this.tm.transition(taskId, 'working', current.assignee, current.version);
    }

    // 7. Auto-assign independent sub-tasks (no dependsOn)
    for (const sub of decomposed) {
      if (sub.dependsOn?.length) continue;
      const subId = titleToId.get(sub.title)!;
      const subTask = this.tm.get(subId);
      if (!subTask) continue;
      const result = this.dispatcher.autoAssign(subTask);
      if (result) {
        this.bus.emit({
          type: 'task.assigned',
          data: { taskId: subId, agentId: result.agent.agentId, reason: 'coordinator_dispatch' },
        });
      }
    }

    logger.info(
      { taskId, subTaskCount: decomposed.length },
      'Coordinator decomposed task into sub-tasks',
    );
  }
}
