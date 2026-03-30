import type { Task } from '@hive/shared';
import type { HiveUser } from '../config.js';

/**
 * Role-based task visibility filter (AUTH-03).
 * - manager: sees all tasks
 * - other roles: sees tasks they created, tasks assigned to them, and unassigned pending tasks
 */
export function filterTasksByRole(tasks: Task[], user: HiveUser): Task[] {
  if (user.role === 'manager') return tasks;
  return tasks.filter(t =>
    t.createdBy === user.id ||
    t.assignee === user.id ||
    (t.assignee === null && t.status === 'pending')
  );
}
