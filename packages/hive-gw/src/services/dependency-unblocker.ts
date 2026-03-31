import type { TaskMachine } from './task-machine.js';
import type { EventBus } from './event-bus.js';
import type { Dispatcher } from './dispatcher.js';
import { logger } from '../config.js';

/**
 * DependencyUnblocker listens for task.completed events and automatically
 * dispatches tasks whose dependencies are now fully satisfied.
 *
 * This enables campaign DAGs: A → B → C where B is auto-assigned
 * the moment A completes.
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
  }
}
