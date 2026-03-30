import type { Task } from '@hive/shared';
import type { TaskMachine } from './task-machine.js';
import type { EventBus } from './event-bus.js';
import { logger } from '../config.js';

const MAX_VERIFY_FAILURES = 2; // after this many fix cycles, stop auto-creating fixes

/**
 * VerifyLoop listens for task lifecycle events and automatically creates
 * verify/fix sub-tasks when orchestration fields indicate it.
 *
 * Rules:
 * - task.completed + verificationRequired → create verify sub-task
 * - task.completed + taskKind === 'fix' → create re-verify sub-task
 * - task.failed + taskKind === 'verify' → create fix sub-task (up to MAX_VERIFY_FAILURES)
 */
export class VerifyLoop {
  private tm: TaskMachine;
  private bus: EventBus;
  private verifyFailureCount = new Map<string, number>(); // runId → failure count

  constructor(tm: TaskMachine, bus: EventBus) {
    this.tm = tm;
    this.bus = bus;
  }

  registerHooks(): void {
    this.bus.on('task.completed', (event) => {
      const task = this.tm.get(event.data.taskId as string);
      if (!task) return;
      this.onTaskCompleted(task);
    });

    this.bus.on('task.failed', (event) => {
      const task = this.tm.get(event.data.taskId as string);
      if (!task) return;
      this.onTaskFailed(task);
    });

    logger.info('VerifyLoop hooks registered');
  }

  private onTaskCompleted(task: Task): void {
    // Case 1: execute/custom task with verificationRequired → create verify
    if (task.verificationRequired && task.taskKind !== 'verify' && task.taskKind !== 'fix') {
      this.createVerifyTask(task);
      return;
    }

    // Case 2: fix task completed → create re-verify
    if (task.taskKind === 'fix') {
      this.createVerifyTask(task);
      return;
    }
  }

  private onTaskFailed(task: Task): void {
    // Only auto-create fix for verify task failures
    if (task.taskKind !== 'verify') return;

    const runId = task.runId ?? task.parentTaskId ?? task.id;
    const failures = (this.verifyFailureCount.get(runId) ?? 0) + 1;
    this.verifyFailureCount.set(runId, failures);

    if (failures > MAX_VERIFY_FAILURES) {
      logger.warn({ runId, failures }, 'Max verify failures reached — no more auto-fix tasks');
      this.bus.emit({
        type: 'task.updated',
        data: {
          taskId: task.id,
          action: 'escalate',
          reason: `Verify failed ${failures} times, max ${MAX_VERIFY_FAILURES} fix cycles reached`,
          runId: runId,
        },
      });
      return;
    }

    this.createFixTask(task);
  }

  private createVerifyTask(parentTask: Task): void {
    const verifyTask = this.tm.create({
      title: `Verify: ${parentTask.title}`,
      description: `Verify the output of task ${parentTask.id}. Result: ${parentTask.result ?? 'N/A'}`,
      requiredCapabilities: parentTask.requiredCapabilities,
      createdBy: 'verify-loop',
      taskKind: 'verify',
      parentTaskId: parentTask.id,
      runId: parentTask.runId,
      contextRef: `task://${parentTask.id}`,
    });

    logger.info({ parentTaskId: parentTask.id, verifyTaskId: verifyTask.id }, 'Auto-created verify sub-task');

    this.bus.emit({
      type: 'task.assigned',
      data: { taskId: verifyTask.id, action: 'auto_verify', parentTaskId: parentTask.id },
    });
  }

  private createFixTask(verifyTask: Task): void {
    const fixTask = this.tm.create({
      title: `Fix: ${verifyTask.title.replace('Verify: ', '')}`,
      description: `Fix issues found during verification of task ${verifyTask.parentTaskId}. Error: ${verifyTask.error ?? 'N/A'}`,
      requiredCapabilities: verifyTask.requiredCapabilities,
      createdBy: 'verify-loop',
      taskKind: 'fix',
      parentTaskId: verifyTask.id,
      runId: verifyTask.runId,
      verificationRequired: true, // fix completion triggers re-verify
      contextRef: `task://${verifyTask.id}`,
    });

    logger.info({ verifyTaskId: verifyTask.id, fixTaskId: fixTask.id }, 'Auto-created fix sub-task');

    this.bus.emit({
      type: 'task.assigned',
      data: { taskId: fixTask.id, action: 'auto_fix', parentTaskId: verifyTask.id },
    });
  }
}
