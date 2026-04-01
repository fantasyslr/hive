import type { TaskMachine } from './task-machine.js';
import type { EventBus } from './event-bus.js';
import type { Dispatcher } from './dispatcher.js';
import { logger } from '../config.js';

/**
 * DependencyUnblocker listens for task.completed events and automatically
 * dispatches tasks whose dependencies are now fully satisfied.
 *
 * Also handles synthesis trigger: when all sub-tasks of a coordinate parent
 * complete, auto-creates a synthesize task to aggregate results.
 * When the synthesize task completes, transitions the parent to done.
 */
export class DependencyUnblocker {
  constructor(
    private tm: TaskMachine,
    private bus: EventBus,
    private dispatcher: Dispatcher,
  ) {}

  registerHooks(): void {
    this.bus.on('task.completed', (event) => {
      const completedTaskId = event.data.taskId as string;
      if (!completedTaskId) return;
      this.onTaskCompleted(completedTaskId);
    });

    logger.info('DependencyUnblocker hooks registered');
  }

  private onTaskCompleted(completedTaskId: string): void {
    const allTasks = this.tm.getAll();

    // --- Dependency unblocking ---
    for (const task of allTasks) {
      // Only consider pending tasks with dependencies
      if (task.status !== 'pending' || !task.dependsOn?.length) continue;
      // Only if this task depends on the one that just completed
      if (!task.dependsOn.includes(completedTaskId)) continue;

      // Check if ALL dependencies are now done
      const allDepsDone = task.dependsOn.every(depId => {
        const dep = this.tm.get(depId);
        return dep?.status === 'done';
      });

      if (allDepsDone) {
        const result = this.dispatcher.autoAssign(task);
        if (result) {
          logger.info(
            { taskId: task.id, agentId: result.agent.agentId, unblockedBy: completedTaskId },
            'Dependency-unblocked task auto-assigned',
          );
          this.bus.emit({
            type: 'task.assigned',
            data: { taskId: task.id, agentId: result.agent.agentId, reason: 'dependency_unblocked' },
          });
        }
      }
    }

    // --- Synthesis trigger: check if all siblings of a coordinate parent are done ---
    const completedTask = this.tm.get(completedTaskId);
    if (completedTask?.parentTaskId) {
      // Case 1: synthesize task completed → transition parent to done
      if (completedTask.taskKind === 'synthesize') {
        this.onSynthesizeCompleted(completedTask);
        return;
      }
      // Case 2: regular sub-task completed → check if all siblings done
      this.checkSynthesisTrigger(completedTask);
    }
  }

  private checkSynthesisTrigger(task: { parentTaskId?: string; id: string }): void {
    if (!task.parentTaskId) return;

    const parent = this.tm.get(task.parentTaskId);
    if (!parent || parent.taskKind !== 'coordinate') return;

    // Get all sub-tasks (exclude existing synthesize tasks)
    const siblings = this.tm.getAll().filter(
      t => t.parentTaskId === parent.id && t.taskKind !== 'synthesize',
    );

    // Check if ALL siblings are done
    const allDone = siblings.every(s => s.status === 'done');
    if (!allDone) return;

    // Build aggregated sibling results
    const siblingResults = siblings.map(s => ({
      taskId: s.id,
      title: s.title,
      result: s.result,
      taskKind: s.taskKind,
    }));

    // Create synthesize task
    const synthesizeTask = this.tm.create({
      title: `Synthesize: ${parent.title}`,
      description: `Aggregate results from ${siblings.length} sub-tasks of coordinate task ${parent.id}`,
      requiredCapabilities: parent.requiredCapabilities,
      createdBy: 'coordinator',
      taskKind: 'synthesize',
      parentTaskId: parent.id,
      runId: parent.runId ?? parent.id,
      contextRef: JSON.stringify(siblingResults),
    });

    logger.info(
      { parentTaskId: parent.id, synthesizeTaskId: synthesizeTask.id, siblingCount: siblings.length },
      'Auto-created synthesize task — all sub-tasks complete',
    );

    // Auto-assign synthesize task
    const result = this.dispatcher.autoAssign(synthesizeTask);
    if (result) {
      this.bus.emit({
        type: 'task.assigned',
        data: { taskId: synthesizeTask.id, agentId: result.agent.agentId, reason: 'synthesis_trigger' },
      });
    }
  }

  private onSynthesizeCompleted(synthTask: { parentTaskId?: string; result?: string | null; id: string }): void {
    if (!synthTask.parentTaskId) return;

    const parent = this.tm.get(synthTask.parentTaskId);
    if (!parent || parent.taskKind !== 'coordinate') return;

    // Transition parent coordinate task to done with synthesized result
    try {
      this.tm.transition(parent.id, 'done', parent.assignee, parent.version, {
        result: synthTask.result ?? null,
      });
      logger.info(
        { parentTaskId: parent.id, synthesizeTaskId: synthTask.id },
        'Coordinate task completed via synthesis',
      );
      this.bus.emit({
        type: 'task.completed',
        data: { taskId: parent.id, reason: 'synthesis_complete' },
      });
    } catch (err) {
      logger.error({ err, parentTaskId: parent.id }, 'Failed to transition coordinate parent to done');
    }
  }
}
