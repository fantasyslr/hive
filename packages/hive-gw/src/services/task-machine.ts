import { nanoid } from 'nanoid';
import { VALID_TRANSITIONS } from '@hive/shared';
import type { Task, TaskStatus } from '@hive/shared';
import { ConflictError, InvalidTransitionError, NotFoundError } from '../middleware/error-handler.js';

export class TaskMachine {
  private tasks = new Map<string, Task>();

  create(params: {
    title: string; description: string; requiredCapabilities: string[]; createdBy: string;
    fromAgentId?: string; toAgentId?: string; contextRef?: string; artifacts?: string[];
    taskKind?: string; parentTaskId?: string; runId?: string; verificationRequired?: boolean;
    dependsOn?: string[];
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
      retryCount: 0,
      ...(params.fromAgentId && { fromAgentId: params.fromAgentId }),
      ...(params.toAgentId && { toAgentId: params.toAgentId }),
      ...(params.contextRef && { contextRef: params.contextRef }),
      ...(params.artifacts && { artifacts: params.artifacts }),
      ...(params.taskKind && { taskKind: params.taskKind as any }),
      ...(params.parentTaskId && { parentTaskId: params.parentTaskId }),
      ...(params.runId && { runId: params.runId }),
      ...(params.verificationRequired !== undefined && { verificationRequired: params.verificationRequired }),
      ...(params.dependsOn && { dependsOn: params.dependsOn }),
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

  delete(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    this.tasks.delete(taskId);
    return task;
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
      // Bump retryCount before transition resets assignee
      this.tasks.set(taskId, { ...task, retryCount: (task.retryCount ?? 0) + 1 });
    }
    return this.transition(taskId, 'pending', null, expectedVersion);
  }

  releaseClaimedTasksForAgent(agentId: string): Task[] {
    const released: Task[] = [];
    for (const task of this.tasks.values()) {
      if (task.assignee === agentId && task.status === 'claimed') {
        const updated: Task = {
          ...task,
          status: 'pending',
          assignee: null,
          error: null,
          version: task.version + 1,
          updatedAt: new Date().toISOString(),
        };
        this.tasks.set(task.id, updated);
        released.push(updated);
      }
    }
    return released;
  }

  /** Update dependsOn field on a task — used by batch creation for title-to-ID resolution */
  setDependsOn(taskId: string, deps: string[]): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const updated = { ...task, dependsOn: deps, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /** Bulk-load a task from snapshot recovery — bypasses state transition validation. Only called during startup recovery. */
  restore(task: Task & { retryCount?: number }): void {
    task.retryCount = task.retryCount ?? 0;
    this.tasks.set(task.id, task);
  }

  /** Replace outputRefs entirely — used by PATCH route when agent provides explicit refs */
  setOutputRefs(taskId: string, refs: string[]): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    if (this.sameRefs(task.outputRefs, refs)) {
      return task;
    }
    const updated = { ...task, outputRefs: refs, version: task.version + 1, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /** Append to existing outputRefs — used by event listener auto-write to avoid clobbering PATCH-provided refs */
  appendOutputRefs(taskId: string, refs: string[]): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const existing = task.outputRefs ?? [];
    const merged = [...new Set([...existing, ...refs])]; // deduplicate
    if (this.sameRefs(existing, merged)) {
      return task;
    }
    const updated = { ...task, outputRefs: merged, version: task.version + 1, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /** Update contextRef on a task — used by HistoryInjector to attach related conclusions */
  updateContextRef(taskId: string, contextRef: string | import('@hive/shared').HistoryContext[]): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const updated = { ...task, contextRef, updatedAt: new Date().toISOString() };
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
