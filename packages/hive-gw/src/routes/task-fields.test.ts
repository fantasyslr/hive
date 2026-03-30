import { describe, it, expect, beforeEach } from 'vitest';
import { TaskMachine } from '../services/task-machine.js';
import { CreateTaskSchema } from '@hive/shared';

describe('Task collaboration metadata fields', () => {
  let tm: TaskMachine;

  beforeEach(() => {
    tm = new TaskMachine();
  });

  it('CreateTaskSchema accepts optional collaboration fields', () => {
    const parsed = CreateTaskSchema.safeParse({
      title: 'Review auth',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      fromAgentId: 'orchestrator',
      toAgentId: 'reviewer-1',
      contextRef: 'mem://decisions/auth-refactor',
      artifacts: ['./src/auth.ts'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fromAgentId).toBe('orchestrator');
      expect(parsed.data.toAgentId).toBe('reviewer-1');
      expect(parsed.data.contextRef).toBe('mem://decisions/auth-refactor');
      expect(parsed.data.artifacts).toEqual(['./src/auth.ts']);
    }
  });

  it('CreateTaskSchema still works without optional collaboration fields', () => {
    const parsed = CreateTaskSchema.safeParse({
      title: 'Simple task',
      requiredCapabilities: ['coding'],
      createdBy: 'someone',
    });
    expect(parsed.success).toBe(true);
  });

  it('TaskMachine.create preserves collaboration fields', () => {
    const task = tm.create({
      title: 'Review auth',
      description: '',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      fromAgentId: 'orchestrator',
      toAgentId: 'reviewer-1',
      contextRef: 'mem://decisions/auth-refactor',
      artifacts: ['./src/auth.ts'],
    });
    expect(task.fromAgentId).toBe('orchestrator');
    expect(task.toAgentId).toBe('reviewer-1');
    expect(task.contextRef).toBe('mem://decisions/auth-refactor');
    expect(task.artifacts).toEqual(['./src/auth.ts']);
  });

  it('board snapshot includes collaboration fields', () => {
    const task = tm.create({
      title: 'Test',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'a',
      contextRef: 'mem://foo',
    });
    const all = tm.getAll();
    expect(all[0].contextRef).toBe('mem://foo');
  });
});
