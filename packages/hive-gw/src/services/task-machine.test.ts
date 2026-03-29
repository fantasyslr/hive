import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictError } from '../middleware/error-handler.js';
import { TaskMachine } from './task-machine.js';

describe('TaskMachine', () => {
  let taskMachine: TaskMachine;

  beforeEach(() => {
    taskMachine = new TaskMachine();
  });

  it('rejects transitions from a different agent after claim', () => {
    const task = taskMachine.create({
      title: 'Write code',
      description: 'Ship a fix',
      requiredCapabilities: ['code'],
      createdBy: 'user-1',
    });

    const claimed = taskMachine.claim(task.id, 'agent-a', task.version);

    expect(() => taskMachine.transition(task.id, 'working', 'agent-b', claimed.version)).toThrow(ConflictError);
    expect(taskMachine.get(task.id)?.assignee).toBe('agent-a');
    expect(taskMachine.get(task.id)?.status).toBe('claimed');
  });

  it('bumps version and updatedAt when output refs are replaced or appended', async () => {
    const task = taskMachine.create({
      title: 'Write code',
      description: 'Ship a fix',
      requiredCapabilities: ['code'],
      createdBy: 'user-1',
    });

    const claimed = taskMachine.claim(task.id, 'agent-a', task.version);
    const working = taskMachine.transition(task.id, 'working', 'agent-a', claimed.version);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const withExplicitRefs = taskMachine.setOutputRefs(task.id, ['mem://explicit'])!;
    expect(withExplicitRefs.version).toBe(working.version + 1);
    expect(withExplicitRefs.updatedAt).not.toBe(working.updatedAt);
    expect(withExplicitRefs.output_refs).toEqual(['mem://explicit']);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const withAppendedRefs = taskMachine.appendOutputRefs(task.id, ['mem://derived'])!;
    expect(withAppendedRefs.version).toBe(withExplicitRefs.version + 1);
    expect(withAppendedRefs.updatedAt).not.toBe(withExplicitRefs.updatedAt);
    expect(withAppendedRefs.output_refs).toEqual(['mem://explicit', 'mem://derived']);
  });
});
