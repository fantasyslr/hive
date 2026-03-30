import { describe, expect, it } from 'vitest';
import { TaskMachine } from './task-machine.js';

describe('TaskMachine.releaseClaimedTasksForAgent', () => {
  it('releases only claimed tasks for an offline agent', () => {
    const tm = new TaskMachine();

    const claimed = tm.create({
      title: 'Claimed task',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });
    tm.claim(claimed.id, 'agent-a', claimed.version);

    const working = tm.create({
      title: 'Working task',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });
    const workingClaimed = tm.claim(working.id, 'agent-a', working.version);
    tm.transition(working.id, 'working', 'agent-a', workingClaimed.version);

    const other = tm.create({
      title: 'Other agent task',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'orchestrator',
    });
    tm.claim(other.id, 'agent-b', other.version);

    const released = tm.releaseClaimedTasksForAgent('agent-a');

    expect(released).toHaveLength(1);
    expect(released[0].id).toBe(claimed.id);
    expect(tm.get(claimed.id)?.status).toBe('pending');
    expect(tm.get(claimed.id)?.assignee).toBeNull();
    expect(tm.get(working.id)?.status).toBe('working');
    expect(tm.get(working.id)?.assignee).toBe('agent-a');
    expect(tm.get(other.id)?.status).toBe('claimed');
    expect(tm.get(other.id)?.assignee).toBe('agent-b');
  });
});
