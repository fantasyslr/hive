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
      from_agent_id: 'orchestrator',
      to_agent_id: 'reviewer-1',
      context_ref: 'mem://decisions/auth-refactor',
      artifacts: ['./src/auth.ts'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.from_agent_id).toBe('orchestrator');
      expect(parsed.data.to_agent_id).toBe('reviewer-1');
      expect(parsed.data.context_ref).toBe('mem://decisions/auth-refactor');
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
      from_agent_id: 'orchestrator',
      to_agent_id: 'reviewer-1',
      context_ref: 'mem://decisions/auth-refactor',
      artifacts: ['./src/auth.ts'],
    });
    expect(task.from_agent_id).toBe('orchestrator');
    expect(task.to_agent_id).toBe('reviewer-1');
    expect(task.context_ref).toBe('mem://decisions/auth-refactor');
    expect(task.artifacts).toEqual(['./src/auth.ts']);
  });

  it('board snapshot includes collaboration fields', () => {
    const task = tm.create({
      title: 'Test',
      description: '',
      requiredCapabilities: ['x'],
      createdBy: 'a',
      context_ref: 'mem://foo',
    });
    const all = tm.getAll();
    expect(all[0].context_ref).toBe('mem://foo');
  });
});
