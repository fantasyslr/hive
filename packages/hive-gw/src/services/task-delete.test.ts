import { describe, expect, it } from 'vitest';
import { TaskMachine } from './task-machine.js';

describe('TaskMachine.delete', () => {
  it('removes an existing task and returns it', () => {
    const tm = new TaskMachine();
    const task = tm.create({
      title: 'Demo task',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'demo-script',
    });

    const deleted = tm.delete(task.id);

    expect(deleted.id).toBe(task.id);
    expect(tm.get(task.id)).toBeUndefined();
    expect(tm.getAll()).toHaveLength(0);
  });
});
