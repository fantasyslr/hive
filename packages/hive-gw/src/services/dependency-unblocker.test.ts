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

  describe('Synthesis trigger', () => {
    it('creates synthesize task when all siblings of coordinate parent are done', () => {
      // Create coordinate parent
      const parent = tm.create({
        title: 'Coordinate Goal',
        description: 'Big task',
        requiredCapabilities: ['research'],
        createdBy: 'test',
        taskKind: 'coordinate',
      });
      // Claim and move to working
      tm.claim(parent.id, 'agent-1', parent.version);
      tm.transition(parent.id, 'working', 'agent-1', parent.version + 1);

      // Create two sub-tasks
      const sub1 = tm.create({
        title: 'Sub 1',
        description: '',
        requiredCapabilities: ['research'],
        createdBy: 'coordinator',
        taskKind: 'execute',
        parentTaskId: parent.id,
      });
      const sub2 = tm.create({
        title: 'Sub 2',
        description: '',
        requiredCapabilities: ['research'],
        createdBy: 'coordinator',
        taskKind: 'execute',
        parentTaskId: parent.id,
      });

      // Complete sub1
      tm.claim(sub1.id, 'agent-1', sub1.version);
      tm.transition(sub1.id, 'working', 'agent-1', sub1.version + 1);
      tm.transition(sub1.id, 'done', 'agent-1', sub1.version + 2, { result: 'result-1' });
      bus.emit({ type: 'task.completed', data: { taskId: sub1.id } });

      // No synthesize task yet
      const midSynth = tm.getAll().filter(t => t.taskKind === 'synthesize');
      expect(midSynth.length).toBe(0);

      // Complete sub2
      tm.claim(sub2.id, 'agent-1', sub2.version);
      tm.transition(sub2.id, 'working', 'agent-1', sub2.version + 1);
      tm.transition(sub2.id, 'done', 'agent-1', sub2.version + 2, { result: 'result-2' });
      bus.emit({ type: 'task.completed', data: { taskId: sub2.id } });

      // Now synthesize task should exist
      const synthTasks = tm.getAll().filter(t => t.taskKind === 'synthesize');
      expect(synthTasks.length).toBe(1);
      expect(synthTasks[0].parentTaskId).toBe(parent.id);
      expect(synthTasks[0].title).toContain('Synthesize');
      expect(synthTasks[0].requiredCapabilities).toEqual(['research']);

      // contextRef should contain sibling results
      const ctx = JSON.parse(synthTasks[0].contextRef as string);
      expect(ctx).toHaveLength(2);
      expect(ctx[0].result).toBe('result-1');
      expect(ctx[1].result).toBe('result-2');
    });

    it('does NOT trigger synthesis when some siblings still pending', () => {
      const parent = tm.create({
        title: 'Coordinate',
        description: '',
        requiredCapabilities: ['research'],
        createdBy: 'test',
        taskKind: 'coordinate',
      });
      tm.claim(parent.id, 'agent-1', parent.version);
      tm.transition(parent.id, 'working', 'agent-1', parent.version + 1);

      const sub1 = tm.create({
        title: 'Sub 1', description: '', requiredCapabilities: ['research'],
        createdBy: 'coordinator', taskKind: 'execute', parentTaskId: parent.id,
      });
      tm.create({
        title: 'Sub 2', description: '', requiredCapabilities: ['research'],
        createdBy: 'coordinator', taskKind: 'execute', parentTaskId: parent.id,
      });

      // Complete only sub1
      tm.claim(sub1.id, 'agent-1', sub1.version);
      tm.transition(sub1.id, 'working', 'agent-1', sub1.version + 1);
      tm.transition(sub1.id, 'done', 'agent-1', sub1.version + 2, { result: 'done' });
      bus.emit({ type: 'task.completed', data: { taskId: sub1.id } });

      const synthTasks = tm.getAll().filter(t => t.taskKind === 'synthesize');
      expect(synthTasks.length).toBe(0);
    });

    it('does NOT trigger synthesis for non-coordinate parent', () => {
      const parent = tm.create({
        title: 'Execute Parent',
        description: '',
        requiredCapabilities: ['research'],
        createdBy: 'test',
        taskKind: 'execute',
      });

      const sub1 = tm.create({
        title: 'Sub 1', description: '', requiredCapabilities: ['research'],
        createdBy: 'test', taskKind: 'execute', parentTaskId: parent.id,
      });

      tm.claim(sub1.id, 'agent-1', sub1.version);
      tm.transition(sub1.id, 'working', 'agent-1', sub1.version + 1);
      tm.transition(sub1.id, 'done', 'agent-1', sub1.version + 2, { result: 'done' });
      bus.emit({ type: 'task.completed', data: { taskId: sub1.id } });

      const synthTasks = tm.getAll().filter(t => t.taskKind === 'synthesize');
      expect(synthTasks.length).toBe(0);
    });

    it('transitions parent to done when synthesize task completes', () => {
      const parent = tm.create({
        title: 'Coordinate Goal',
        description: '',
        requiredCapabilities: ['research'],
        createdBy: 'test',
        taskKind: 'coordinate',
      });
      tm.claim(parent.id, 'agent-1', parent.version);
      tm.transition(parent.id, 'working', 'agent-1', parent.version + 1);

      // Create and complete single sub-task
      const sub1 = tm.create({
        title: 'Sub 1', description: '', requiredCapabilities: ['research'],
        createdBy: 'coordinator', taskKind: 'execute', parentTaskId: parent.id,
      });
      tm.claim(sub1.id, 'agent-1', sub1.version);
      tm.transition(sub1.id, 'working', 'agent-1', sub1.version + 1);
      tm.transition(sub1.id, 'done', 'agent-1', sub1.version + 2, { result: 'sub-result' });
      bus.emit({ type: 'task.completed', data: { taskId: sub1.id } });

      // Synthesize task should be created (and auto-assigned/claimed by dispatcher)
      const synthTask = tm.getAll().find(t => t.taskKind === 'synthesize')!;
      expect(synthTask).toBeDefined();

      // Complete the synthesize task (already claimed by auto-assign)
      const currentSynth = tm.get(synthTask.id)!;
      const startVersion = currentSynth.version;
      if (currentSynth.status === 'pending') {
        tm.claim(synthTask.id, 'agent-1', startVersion);
        tm.transition(synthTask.id, 'working', 'agent-1', startVersion + 1);
        tm.transition(synthTask.id, 'done', 'agent-1', startVersion + 2, { result: 'synthesized output' });
      } else {
        // Already claimed by dispatcher
        tm.transition(synthTask.id, 'working', currentSynth.assignee, startVersion);
        tm.transition(synthTask.id, 'done', currentSynth.assignee, startVersion + 1, { result: 'synthesized output' });
      }
      bus.emit({ type: 'task.completed', data: { taskId: synthTask.id } });

      // Parent should now be done
      const updatedParent = tm.get(parent.id)!;
      expect(updatedParent.status).toBe('done');
      expect(updatedParent.result).toBe('synthesized output');
    });
  });
});
