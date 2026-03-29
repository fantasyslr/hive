import { nanoid } from 'nanoid';
import { VALID_TRANSITIONS } from '@hive/shared';
import type { Task, TaskStatus } from '@hive/shared';
import { ConflictError, InvalidTransitionError, NotFoundError } from '../middleware/error-handler.js';

export class TaskMachine {
  private tasks = new Map<string, Task>();

  create(params: {
    title: string; description: string; requiredCapabilities: string[]; createdBy: string;
    from_agent_id?: string; to_agent_id?: string; context_ref?: string; artifacts?: string[];
    task_kind?: string; parent_task_id?: string; run_id?: string; verification_required?: boolean;
  }): Task {
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
      retry_count: 0,
      ...(params.from_agent_id && { from_agent_id: params.from_agent_id }),
      ...(params.to_agent_id && { to_agent_id: params.to_agent_id }),
      ...(params.context_ref && { context_ref: params.context_ref }),
      ...(params.artifacts && { artifacts: params.artifacts }),
      ...(params.task_kind && { task_kind: params.task_kind as any }),
      ...(params.parent_task_id && { parent_task_id: params.parent_task_id }),
      ...(params.run_id && { run_id: params.run_id }),
      ...(params.verification_required !== undefined && { verification_required: params.verification_required }),
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

  clear(): void {
    this.tasks.clear();
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

    // Once a task leaves pending, only the current assignee may advance it.
    // Exception: null agentId is allowed when returning to pending (retry).
    if (task.status !== 'pending' && agentId !== null && agentId !== task.assignee) {
      throw new ConflictError(`Task ${taskId} is assigned to ${task.assignee}, not ${agentId}`);
    }

    const updated: Task = {
      ...task,
      status: toStatus,
      assignee: toStatus === 'pending' ? null : (task.status === 'pending' ? agentId : task.assignee),
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

  /** Agent rejects a claimed task — returns it to pending for reassignment */
  reject(taskId: string, agentId: string, expectedVersion: number): Task {
    return this.transition(taskId, 'pending', agentId, expectedVersion);
  }

  retry(taskId: string, expectedVersion: number): Task {
    const task = this.tasks.get(taskId);
    if (task) {
      // Bump retry_count before transition resets assignee
      this.tasks.set(taskId, { ...task, retry_count: (task.retry_count ?? 0) + 1 });
    }
    return this.transition(taskId, 'pending', null, expectedVersion);
  }

  /** Bulk-load a task from snapshot recovery — bypasses state transition validation. Only called during startup recovery. */
  restore(task: Task & { retry_count?: number }): void {
    task.retry_count = task.retry_count ?? 0;
    this.tasks.set(task.id, task);
  }

  /** Replace output_refs entirely — used by PATCH route when agent provides explicit refs */
  setOutputRefs(taskId: string, refs: string[]): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    if (this.sameRefs(task.output_refs, refs)) {
      return task;
    }
    const updated = { ...task, output_refs: refs, version: task.version + 1, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /** Append to existing output_refs — used by event listener auto-write to avoid clobbering PATCH-provided refs */
  appendOutputRefs(taskId: string, refs: string[]): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const existing = task.output_refs ?? [];
    const merged = [...new Set([...existing, ...refs])]; // deduplicate
    if (this.sameRefs(existing, merged)) {
      return task;
    }
    const updated = { ...task, output_refs: merged, version: task.version + 1, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  private sameRefs(a?: string[], b?: string[]): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((ref, index) => ref === b[index]);
  }
}

export const taskMachine = new TaskMachine();
