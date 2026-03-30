import { describe, it, expect, beforeEach } from 'vitest';
import { TaskMachine } from '../services/task-machine.js';
import { CreateTaskSchema } from '@hive/shared';

describe('Task orchestration fields (OMC-inspired)', () => {
  let tm: TaskMachine;

  beforeEach(() => {
    tm = new TaskMachine();
  });

  it('CreateTaskSchema accepts orchestration fields', () => {
    const parsed = CreateTaskSchema.safeParse({
      title: 'Verify auth module',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      taskKind: 'verify',
      parentTaskId: 'task-001',
      runId: 'run-abc',
      verificationRequired: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.taskKind).toBe('verify');
      expect(parsed.data.parentTaskId).toBe('task-001');
      expect(parsed.data.runId).toBe('run-abc');
      expect(parsed.data.verificationRequired).toBe(true);
    }
  });

  it('TaskMachine.create preserves orchestration fields', () => {
    const task = tm.create({
      title: 'Execute feature',
      description: '',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      taskKind: 'execute',
      parentTaskId: 'parent-1',
      runId: 'run-123',
      verificationRequired: true,
    });
    expect(task.taskKind).toBe('execute');
    expect(task.parentTaskId).toBe('parent-1');
    expect(task.runId).toBe('run-123');
    expect(task.verificationRequired).toBe(true);
    expect(task.retryCount).toBe(0);
  });

  it('TaskMachine tracks retryCount on retry', () => {
    const task = tm.create({
      title: 'Test task',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'a',
    });
    // claim, work, fail, retry
    tm.claim(task.id, 'agent-1', 1);
    tm.transition(task.id, 'working', 'agent-1', 2);
    tm.transition(task.id, 'failed', 'agent-1', 3, { error: 'boom' });
    const retried = tm.retry(task.id, 4);
    expect(retried.retryCount).toBe(1);
    expect(retried.status).toBe('pending');
  });

  it('old callers without orchestration fields still work', () => {
    const parsed = CreateTaskSchema.safeParse({
      title: 'Simple task',
      requiredCapabilities: ['coding'],
      createdBy: 'someone',
    });
    expect(parsed.success).toBe(true);
  });

  it('taskKind can be plan, execute, verify, fix, review, or custom string', () => {
    for (const kind of ['plan', 'execute', 'verify', 'fix', 'review', 'explore']) {
      const parsed = CreateTaskSchema.safeParse({
        title: 'test',
        requiredCapabilities: ['x'],
        createdBy: 'a',
        taskKind: kind,
      });
      expect(parsed.success).toBe(true);
    }
  });
});
