import { describe, it, expect } from 'vitest';
import { BatchCreateTasksSchema } from './schemas.js';
import type { TaskKind } from './types.js';

describe('TaskKind extended types', () => {
  it('coordinate is a valid TaskKind', () => {
    const kind: TaskKind = 'coordinate';
    expect(kind).toBe('coordinate');
  });

  it('synthesize is a valid TaskKind', () => {
    const kind: TaskKind = 'synthesize';
    expect(kind).toBe('synthesize');
  });
});

describe('BatchCreateTasksSchema', () => {
  it('validates a valid batch with parentTaskId and tasks array', () => {
    const input = {
      parentTaskId: 'task-123',
      tasks: [
        {
          title: 'Sub task 1',
          description: 'Do something',
          requiredCapabilities: ['research'],
        },
      ],
    };
    const result = BatchCreateTasksSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('requires parentTaskId', () => {
    const input = {
      tasks: [
        {
          title: 'Sub task 1',
          requiredCapabilities: ['research'],
        },
      ],
    };
    const result = BatchCreateTasksSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('requires tasks array with at least 1 item', () => {
    const input = {
      parentTaskId: 'task-123',
      tasks: [],
    };
    const result = BatchCreateTasksSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('validates dependsOn as title strings (not IDs)', () => {
    const input = {
      parentTaskId: 'task-123',
      tasks: [
        {
          title: 'Task A',
          requiredCapabilities: ['research'],
        },
        {
          title: 'Task B',
          requiredCapabilities: ['writing'],
          dependsOn: ['Task A'],
        },
      ],
    };
    const result = BatchCreateTasksSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks[1].dependsOn).toEqual(['Task A']);
    }
  });

  it('rejects tasks with empty title', () => {
    const input = {
      parentTaskId: 'task-123',
      tasks: [
        {
          title: '',
          requiredCapabilities: ['research'],
        },
      ],
    };
    const result = BatchCreateTasksSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts optional taskKind on sub-tasks', () => {
    const input = {
      parentTaskId: 'task-123',
      tasks: [
        {
          title: 'Research task',
          requiredCapabilities: ['research'],
          taskKind: 'execute',
        },
      ],
    };
    const result = BatchCreateTasksSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
