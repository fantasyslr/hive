import { describe, it, expect, beforeEach } from 'vitest';
import { TaskMachine } from '../services/task-machine.js';
import { AgentRegistry } from '../services/registry.js';
import { VALID_TRANSITIONS } from '@hive/shared';

describe('Task reject flow', () => {
  let tm: TaskMachine;

  beforeEach(() => {
    tm = new TaskMachine();
  });

  it('VALID_TRANSITIONS allows claimed -> pending (reject path)', () => {
    // This already exists as claimed -> pending, verify it's there
    expect(VALID_TRANSITIONS['claimed']).toContain('pending');
  });

  it('agent can reject a claimed task back to pending', () => {
    const task = tm.create({
      title: 'Unwanted task',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'orchestrator',
    });
    const claimed = tm.claim(task.id, 'agent-1', 1);
    expect(claimed.status).toBe('claimed');
    expect(claimed.assignee).toBe('agent-1');

    // Agent rejects (transitions back to pending)
    const rejected = tm.reject(task.id, 'agent-1', 2);
    expect(rejected.status).toBe('pending');
    expect(rejected.assignee).toBeNull();
  });

  it('only the assigned agent can reject', () => {
    const task = tm.create({
      title: 'Test',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'orchestrator',
    });
    tm.claim(task.id, 'agent-1', 1);

    expect(() => tm.reject(task.id, 'agent-2', 2)).toThrow();
  });

  it('cannot reject a task that is not claimed', () => {
    const task = tm.create({
      title: 'Test',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'orchestrator',
    });

    // pending -> pending is not a valid transition via reject
    expect(() => tm.reject(task.id, 'agent-1', 1)).toThrow();
  });

  it('rejected task can be reclaimed by another agent', () => {
    const task = tm.create({
      title: 'Pass it along',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'orchestrator',
    });
    tm.claim(task.id, 'agent-1', 1);
    tm.reject(task.id, 'agent-1', 2);

    const reclaimed = tm.claim(task.id, 'agent-2', 3);
    expect(reclaimed.assignee).toBe('agent-2');
    expect(reclaimed.status).toBe('claimed');
  });
});
