import { describe, it, expect } from 'vitest';
import type { Task } from '@hive/shared';
import type { HiveUser } from '../config.js';
import { filterTasksByRole } from '../utils/task-visibility.js';

// Helper to create a minimal Task with required fields
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 'task-default',
    title: 'Test task',
    description: 'desc',
    requiredCapabilities: [],
    status: overrides.status ?? 'pending',
    assignee: overrides.assignee ?? null,
    createdBy: overrides.createdBy ?? 'unknown',
    result: null,
    error: null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const managerUser: HiveUser = { id: 'manager', name: '主管', role: 'manager', token: 'tok-mgr' };
const adBuyerUser: HiveUser = { id: 'ad_buyer', name: '投放', role: 'ad_buyer', token: 'tok-ab' };
const operationsUser: HiveUser = { id: 'operations', name: '运营', role: 'operations', token: 'tok-ops' };

describe('filterTasksByRole — role-based task visibility (AUTH-03)', () => {
  const tasks: Task[] = [
    // Task created by ad_buyer, done, assigned to some-agent
    makeTask({ id: 't1', createdBy: 'ad_buyer', status: 'done', assignee: 'some-agent' }),
    // Task created by manager, assigned to ad_buyer
    makeTask({ id: 't2', createdBy: 'manager', status: 'working', assignee: 'ad_buyer' }),
    // Unassigned pending task
    makeTask({ id: 't3', createdBy: 'operations', status: 'pending', assignee: null }),
    // Task by operations, claimed by some-agent
    makeTask({ id: 't4', createdBy: 'operations', status: 'claimed', assignee: 'some-agent' }),
    // Task by operations, done by some-agent
    makeTask({ id: 't5', createdBy: 'operations', status: 'done', assignee: 'some-agent' }),
  ];

  it('manager sees all tasks', () => {
    const result = filterTasksByRole(tasks, managerUser);
    expect(result).toHaveLength(5);
    expect(result.map(t => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('non-manager sees tasks they created', () => {
    const result = filterTasksByRole(tasks, adBuyerUser);
    // ad_buyer created t1
    expect(result.map(t => t.id)).toContain('t1');
  });

  it('non-manager sees tasks assigned to them', () => {
    const result = filterTasksByRole(tasks, adBuyerUser);
    // t2 is assigned to ad_buyer
    expect(result.map(t => t.id)).toContain('t2');
  });

  it('non-manager sees unassigned pending tasks', () => {
    const result = filterTasksByRole(tasks, adBuyerUser);
    // t3 is pending with no assignee
    expect(result.map(t => t.id)).toContain('t3');
  });

  it('non-manager does NOT see tasks created by others that are claimed/working/done by someone else', () => {
    const result = filterTasksByRole(tasks, adBuyerUser);
    // t4 (claimed by some-agent, created by operations) should NOT be visible
    expect(result.map(t => t.id)).not.toContain('t4');
    // t5 (done by some-agent, created by operations) should NOT be visible
    expect(result.map(t => t.id)).not.toContain('t5');
  });

  it('ad_buyer sees exactly 3 tasks in mixed scenario (own-created, assigned-to-me, unassigned-pending)', () => {
    const result = filterTasksByRole(tasks, adBuyerUser);
    expect(result).toHaveLength(3);
    expect(result.map(t => t.id).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('operations user sees their own created tasks plus unassigned pending', () => {
    const result = filterTasksByRole(tasks, operationsUser);
    // operations created t3, t4, t5; t3 is also unassigned pending
    // t3: created by operations (match) AND unassigned pending (match)
    // t4: created by operations (match)
    // t5: created by operations (match)
    expect(result).toHaveLength(3);
    expect(result.map(t => t.id).sort()).toEqual(['t3', 't4', 't5']);
  });

  it('status filter works in combination with role filter', () => {
    // Simulate what the route does: filterTasksByRole then status filter
    let result = filterTasksByRole(tasks, adBuyerUser);
    result = result.filter(t => t.status === 'pending');
    // ad_buyer visible: t1(done), t2(working), t3(pending) -> only t3 matches pending
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t3');
  });

  it('returns empty array when non-manager has no relevant tasks', () => {
    const creativeUser: HiveUser = { id: 'creative', name: '素材', role: 'creative', token: 'tok-cr' };
    // Only task visible to creative would be unassigned pending (t3)
    const result = filterTasksByRole(tasks, creativeUser);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t3');
  });

  it('handles empty task list gracefully', () => {
    expect(filterTasksByRole([], adBuyerUser)).toEqual([]);
    expect(filterTasksByRole([], managerUser)).toEqual([]);
  });
});
