import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskMachine } from './task-machine.js';
import { EventBus } from './event-bus.js';
import { AgentRegistry } from './registry.js';
import { Dispatcher } from './dispatcher.js';
import { CoordinatorService } from './coordinator-service.js';
import type { LlmClient } from './coordinator-service.js';

describe('CoordinatorService', () => {
  let tm: TaskMachine;
  let bus: EventBus;
  let reg: AgentRegistry;
  let dispatcher: Dispatcher;
  let mockLlm: LlmClient;

  beforeEach(() => {
    tm = new TaskMachine();
    bus = new EventBus(100);
    reg = new AgentRegistry();
    dispatcher = new Dispatcher(reg, tm);

    reg.register({
      agentId: 'agent-1',
      name: 'Test Agent',
      capabilities: ['research', 'planning', 'design', 'coding'],
      interests: [],
      endpoint: 'http://localhost:9999',
    });

    mockLlm = {
      query: vi.fn().mockResolvedValue(JSON.stringify([
        { title: 'Sub A', description: 'Do A', taskKind: 'execute', requiredCapabilities: ['research'], dependsOn: [] },
        { title: 'Sub B', description: 'Do B', taskKind: 'execute', requiredCapabilities: ['coding'], dependsOn: ['Sub A'] },
      ])),
    };
  });

  it('decomposes coordinate task into sub-tasks on task.assigned', async () => {
    const svc = new CoordinatorService(tm, bus, dispatcher, mockLlm);
    svc.registerHooks();

    const coordTask = tm.create({
      title: 'Big Goal',
      description: 'A complex multi-step goal',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      taskKind: 'coordinate',
    });

    // Claim the coordinate task first (so it can transition to working)
    tm.claim(coordTask.id, 'agent-1', coordTask.version);

    // Emit task.assigned
    bus.emit({ type: 'task.assigned', data: { taskId: coordTask.id } });

    // Wait for async decomposition
    await vi.waitFor(() => {
      const all = tm.getAll();
      const subs = all.filter(t => t.parentTaskId === coordTask.id);
      expect(subs.length).toBe(2);
    }, { timeout: 1000 });

    const subs = tm.getAll().filter(t => t.parentTaskId === coordTask.id);
    expect(subs[0].title).toBe('Sub A');
    expect(subs[1].title).toBe('Sub B');
    expect(subs[0].parentTaskId).toBe(coordTask.id);
    expect(subs[1].parentTaskId).toBe(coordTask.id);
  });

  it('resolves dependsOn titles to IDs', async () => {
    const svc = new CoordinatorService(tm, bus, dispatcher, mockLlm);
    svc.registerHooks();

    const coordTask = tm.create({
      title: 'Goal',
      description: 'desc',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      taskKind: 'coordinate',
    });
    tm.claim(coordTask.id, 'agent-1', coordTask.version);

    bus.emit({ type: 'task.assigned', data: { taskId: coordTask.id } });

    await vi.waitFor(() => {
      const subs = tm.getAll().filter(t => t.parentTaskId === coordTask.id);
      expect(subs.length).toBe(2);
    }, { timeout: 1000 });

    const subs = tm.getAll().filter(t => t.parentTaskId === coordTask.id);
    const subA = subs.find(t => t.title === 'Sub A')!;
    const subB = subs.find(t => t.title === 'Sub B')!;

    // Sub B should depend on Sub A's ID
    expect(subB.dependsOn).toContain(subA.id);
  });

  it('ignores non-coordinate tasks', async () => {
    const svc = new CoordinatorService(tm, bus, dispatcher, mockLlm);
    svc.registerHooks();

    const execTask = tm.create({
      title: 'Normal Task',
      description: 'Not a coordinate task',
      requiredCapabilities: ['research'],
      createdBy: 'test',
      taskKind: 'execute',
    });

    bus.emit({ type: 'task.assigned', data: { taskId: execTask.id } });

    // Give async a tick
    await new Promise(r => setTimeout(r, 50));

    // LLM should NOT have been called
    expect(mockLlm.query).not.toHaveBeenCalled();
  });

  it('logs warning on LLM failure without throwing', async () => {
    const failLlm: LlmClient = {
      query: vi.fn().mockRejectedValue(new Error('LLM down')),
    };
    const svc = new CoordinatorService(tm, bus, dispatcher, failLlm);
    svc.registerHooks();

    const coordTask = tm.create({
      title: 'Goal',
      description: 'desc',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      taskKind: 'coordinate',
    });
    tm.claim(coordTask.id, 'agent-1', coordTask.version);

    bus.emit({ type: 'task.assigned', data: { taskId: coordTask.id } });

    // Wait a bit - should not throw
    await new Promise(r => setTimeout(r, 100));

    // No sub-tasks created
    const subs = tm.getAll().filter(t => t.parentTaskId === coordTask.id);
    expect(subs.length).toBe(0);

    // Task stays claimed (not transitioned to working since decomposition failed)
    expect(tm.get(coordTask.id)!.status).toBe('claimed');
  });

  it('auto-assigns independent sub-tasks via dispatcher', async () => {
    const svc = new CoordinatorService(tm, bus, dispatcher, mockLlm);
    svc.registerHooks();

    const coordTask = tm.create({
      title: 'Goal',
      description: 'desc',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      taskKind: 'coordinate',
    });
    tm.claim(coordTask.id, 'agent-1', coordTask.version);

    bus.emit({ type: 'task.assigned', data: { taskId: coordTask.id } });

    await vi.waitFor(() => {
      const subs = tm.getAll().filter(t => t.parentTaskId === coordTask.id);
      expect(subs.length).toBe(2);
    }, { timeout: 1000 });

    // Sub A has no deps → should be auto-assigned (claimed)
    const subA = tm.getAll().find(t => t.title === 'Sub A')!;
    expect(subA.status).toBe('claimed');

    // Sub B depends on Sub A → should stay pending
    const subB = tm.getAll().find(t => t.title === 'Sub B')!;
    expect(subB.status).toBe('pending');
  });

  it('transitions coordinate task to working after decomposition', async () => {
    const svc = new CoordinatorService(tm, bus, dispatcher, mockLlm);
    svc.registerHooks();

    const coordTask = tm.create({
      title: 'Goal',
      description: 'desc',
      requiredCapabilities: ['planning'],
      createdBy: 'test',
      taskKind: 'coordinate',
    });
    tm.claim(coordTask.id, 'agent-1', coordTask.version);

    bus.emit({ type: 'task.assigned', data: { taskId: coordTask.id } });

    await vi.waitFor(() => {
      expect(tm.get(coordTask.id)!.status).toBe('working');
    }, { timeout: 1000 });
  });
});
