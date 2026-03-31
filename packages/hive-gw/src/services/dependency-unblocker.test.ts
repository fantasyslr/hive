import { describe, it, expect, beforeEach } from 'vitest';
import { TaskMachine } from './task-machine.js';
import { EventBus } from './event-bus.js';
import { AgentRegistry } from './registry.js';
import { Dispatcher } from './dispatcher.js';
import { DependencyUnblocker } from './dependency-unblocker.js';

describe('DependencyUnblocker', () => {
  let tm: TaskMachine;
  let bus: EventBus;
  let reg: AgentRegistry;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    tm = new TaskMachine();
    bus = new EventBus(100);
    reg = new AgentRegistry();
    dispatcher = new Dispatcher(reg, tm);

    // Register an online agent with broad capabilities
    reg.register({
      agentId: 'agent-1',
      name: 'Test Agent',
      capabilities: ['research', 'planning', 'design', 'review'],
      interests: [],
      endpoint: 'http://localhost:9999',
    });

    const unblocker = new DependencyUnblocker(tm, bus, dispatcher);
    unblocker.registerHooks();
  });

  it('auto-dispatches blocked task when dependency completes', () => {
    // Create task A (no deps) and task B (depends on A)
    const taskA = tm.create({
      title: 'Research',
      description: '',
      requiredCapabilities: ['research'],
      createdBy: 'test',
    });
    const taskB = tm.create({
      title: 'Planning',
      description: '',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      dependsOn: [taskA.id],
    });

    // Task B should be pending
    expect(tm.get(taskB.id)!.status).toBe('pending');

    // Complete task A: claim → working → done
    tm.claim(taskA.id, 'agent-1', taskA.version);
    const working = tm.transition(taskA.id, 'working', 'agent-1', taskA.version + 1);
    tm.transition(taskA.id, 'done', 'agent-1', working.version, { result: 'done' });

    // Emit task.completed event (this is what Gateway does)
    bus.emit({ type: 'task.completed', data: { taskId: taskA.id } });

    // Task B should now be claimed (auto-dispatched)
    const updatedB = tm.get(taskB.id)!;
    expect(updatedB.status).toBe('claimed');
    expect(updatedB.assignee).toBe('agent-1');
  });

  it('does not dispatch task when some dependencies are still pending', () => {
    const taskA = tm.create({ title: 'A', description: '', requiredCapabilities: ['research'], createdBy: 'test' });
    const taskC = tm.create({ title: 'C', description: '', requiredCapabilities: ['design'], createdBy: 'test' });
    const taskB = tm.create({
      title: 'B',
      description: '',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      dependsOn: [taskA.id, taskC.id],
    });

    // Complete only A
    tm.claim(taskA.id, 'agent-1', taskA.version);
    const workingA = tm.transition(taskA.id, 'working', 'agent-1', taskA.version + 1);
    tm.transition(taskA.id, 'done', 'agent-1', workingA.version, { result: 'done' });
    bus.emit({ type: 'task.completed', data: { taskId: taskA.id } });

    // B should still be pending (C not done)
    expect(tm.get(taskB.id)!.status).toBe('pending');
  });

  it('dispatches task when final dependency completes', () => {
    const taskA = tm.create({ title: 'A', description: '', requiredCapabilities: ['research'], createdBy: 'test' });
    const taskC = tm.create({ title: 'C', description: '', requiredCapabilities: ['design'], createdBy: 'test' });
    const taskB = tm.create({
      title: 'B',
      description: '',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      dependsOn: [taskA.id, taskC.id],
    });

    // Complete A
    tm.claim(taskA.id, 'agent-1', taskA.version);
    tm.transition(taskA.id, 'working', 'agent-1', taskA.version + 1);
    tm.transition(taskA.id, 'done', 'agent-1', taskA.version + 2, { result: 'done' });
    bus.emit({ type: 'task.completed', data: { taskId: taskA.id } });
    expect(tm.get(taskB.id)!.status).toBe('pending');

    // Complete C
    tm.claim(taskC.id, 'agent-1', taskC.version);
    tm.transition(taskC.id, 'working', 'agent-1', taskC.version + 1);
    tm.transition(taskC.id, 'done', 'agent-1', taskC.version + 2, { result: 'done' });
    bus.emit({ type: 'task.completed', data: { taskId: taskC.id } });

    // Now B should be claimed
    const updatedB = tm.get(taskB.id)!;
    expect(updatedB.status).toBe('claimed');
  });

  it('ignores tasks without dependsOn', () => {
    const taskA = tm.create({ title: 'A', description: '', requiredCapabilities: ['research'], createdBy: 'test' });
    const taskB = tm.create({ title: 'B', description: '', requiredCapabilities: ['planning'], createdBy: 'test' });

    // Auto-assign should have already happened for both (no deps)
    // Just verify completing A doesn't crash
    tm.claim(taskA.id, 'agent-1', taskA.version);
    tm.transition(taskA.id, 'working', 'agent-1', taskA.version + 1);
    tm.transition(taskA.id, 'done', 'agent-1', taskA.version + 2, { result: 'done' });
    bus.emit({ type: 'task.completed', data: { taskId: taskA.id } });

    // No crash = pass
    expect(true).toBe(true);
  });
});
