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
      task_kind: 'verify',
      parent_task_id: 'task-001',
      run_id: 'run-abc',
      verification_required: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.task_kind).toBe('verify');
      expect(parsed.data.parent_task_id).toBe('task-001');
      expect(parsed.data.run_id).toBe('run-abc');
      expect(parsed.data.verification_required).toBe(true);
    }
  });

  it('TaskMachine.create preserves orchestration fields', () => {
    const task = tm.create({
      title: 'Execute feature',
      description: '',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      task_kind: 'execute',
      parent_task_id: 'parent-1',
      run_id: 'run-123',
      verification_required: true,
    });
    expect(task.task_kind).toBe('execute');
    expect(task.parent_task_id).toBe('parent-1');
    expect(task.run_id).toBe('run-123');
    expect(task.verification_required).toBe(true);
    expect(task.retry_count).toBe(0);
  });

  it('TaskMachine tracks retry_count on retry', () => {
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
    expect(retried.retry_count).toBe(1);
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

  it('task_kind can be plan, execute, verify, fix, review, or custom string', () => {
    for (const kind of ['plan', 'execute', 'verify', 'fix', 'review', 'explore']) {
      const parsed = CreateTaskSchema.safeParse({
        title: 'test',
        requiredCapabilities: ['x'],
        createdBy: 'a',
        task_kind: kind,
      });
      expect(parsed.success).toBe(true);
    }
  });
});
