import { nanoid } from 'nanoid';
import { VALID_TRANSITIONS } from '@hive/shared';
import type { Task, TaskStatus } from '@hive/shared';
import { ConflictError, InvalidTransitionError, NotFoundError } from '../middleware/error-handler.js';

export class TaskMachine {
  private tasks = new Map<string, Task>();

  create(params: { title: string; description: string; requiredCapabilities: string[]; createdBy: string }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: nanoid(),
      title: params.title,
      description: params.description,
      requiredCapabilities: params.requiredCapabilities,
      status: 'pending',
      assignee: null,
      createdBy: params.createdBy,
      result: null,
      error: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  transition(
    taskId: string,
    toStatus: TaskStatus,
    agentId: string | null,
    expectedVersion: number,
    extras?: { result?: string | null; error?: string | null },
  ): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    if (task.version !== expectedVersion) {
      throw new ConflictError(`Version mismatch — expected ${expectedVersion}, actual ${task.version}`);
    }
    if (!VALID_TRANSITIONS[task.status]?.includes(toStatus)) {
      throw new InvalidTransitionError(`Cannot transition from ${task.status} to ${toStatus}`);
    }

    const updated: Task = {
      ...task,
      status: toStatus,
      assignee: toStatus === 'pending' ? null : (agentId ?? task.assignee),
      result: extras?.result !== undefined ? extras.result : task.result,
      error: toStatus === 'pending' ? null : (extras?.error !== undefined ? extras.error : task.error),
      version: task.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  claim(taskId: string, agentId: string, expectedVersion: number): Task {
    return this.transition(taskId, 'claimed', agentId, expectedVersion);
  }

  retry(taskId: string, expectedVersion: number): Task {
    return this.transition(taskId, 'pending', null, expectedVersion);
  }

  /** Bulk-load a task from snapshot recovery — bypasses state transition validation. Only called during startup recovery. */
  restore(task: Task): void {
    this.tasks.set(task.id, task);
  }

  /** Replace output_refs entirely — used by PATCH route when agent provides explicit refs */
  setOutputRefs(taskId: string, refs: string[]): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.set(taskId, { ...task, output_refs: refs });
    }
  }

  /** Append to existing output_refs — used by event listener auto-write to avoid clobbering PATCH-provided refs */
  appendOutputRefs(taskId: string, refs: string[]): void {
    const task = this.tasks.get(taskId);
    if (task) {
      const existing = task.output_refs ?? [];
      const merged = [...new Set([...existing, ...refs])]; // deduplicate
      this.tasks.set(taskId, { ...task, output_refs: merged });
    }
  }
}

export const taskMachine = new TaskMachine();
