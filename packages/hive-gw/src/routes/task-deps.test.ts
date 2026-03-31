import { describe, it, expect, beforeEach } from 'vitest';
import { TaskMachine } from '../services/task-machine.js';
import { AgentRegistry } from '../services/registry.js';

describe('Task dependency enforcement', () => {
  let tm: TaskMachine;

  beforeEach(() => {
    tm = new TaskMachine();
  });

  it('task with no dependsOn can be claimed normally', () => {
    const task = tm.create({
      title: 'Independent task',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });

    // No dependsOn — claim should succeed
    const claimed = tm.claim(task.id, 'agent-1', 1);
    expect(claimed.status).toBe('claimed');
    expect(claimed.assignee).toBe('agent-1');
  });

  it('task with dependsOn where all deps are "done" can be claimed', () => {
    const dep = tm.create({
      title: 'Prerequisite',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });

    const task = tm.create({
      title: 'Dependent task',
      description: '',
      requiredCapabilities: ['planning'],
      createdBy: 'orchestrator',
      dependsOn: [dep.id],
    });

    // Move dep to done
    tm.claim(dep.id, 'agent-1', 1);
    tm.transition(dep.id, 'working', 'agent-1', 2);
    tm.transition(dep.id, 'done', 'agent-1', 3);

    // Check deps are met
    const depTask = tm.get(task.id)!;
    expect(depTask.dependsOn).toEqual([dep.id]);

    const depStatus = tm.get(dep.id)!;
    expect(depStatus.status).toBe('done');

    // All deps done — claim should succeed
    const unmetDeps = checkUnmetDeps(tm, task.id);
    expect(unmetDeps).toHaveLength(0);
  });

  it('task with dependsOn where a dep is still "working" is blocked', () => {
    const dep = tm.create({
      title: 'Blocker',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });

    const task = tm.create({
      title: 'Blocked task',
      description: '',
      requiredCapabilities: ['planning'],
      createdBy: 'orchestrator',
      dependsOn: [dep.id],
    });

    // Move dep to working (not done)
    tm.claim(dep.id, 'agent-1', 1);
    tm.transition(dep.id, 'working', 'agent-1', 2);

    const unmetDeps = checkUnmetDeps(tm, task.id);
    expect(unmetDeps).toHaveLength(1);
    expect(unmetDeps[0]).toBe(dep.id);
  });

  it('task with dependsOn where a dep is "pending" is blocked', () => {
    const dep = tm.create({
      title: 'Not started',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });

    const task = tm.create({
      title: 'Blocked task',
      description: '',
      requiredCapabilities: ['planning'],
      createdBy: 'orchestrator',
      dependsOn: [dep.id],
    });

    const unmetDeps = checkUnmetDeps(tm, task.id);
    expect(unmetDeps).toHaveLength(1);
    expect(unmetDeps[0]).toBe(dep.id);
  });
});

/** Helper: replicates the dependency check logic from the claim route */
function checkUnmetDeps(tm: TaskMachine, taskId: string): string[] {
  const task = tm.get(taskId);
  if (!task || !task.dependsOn || task.dependsOn.length === 0) return [];
  return task.dependsOn.filter(depId => {
    const dep = tm.get(depId);
    return !dep || dep.status !== 'done';
  });
}
