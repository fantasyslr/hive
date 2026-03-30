import { describe, it, expect, vi } from 'vitest';
import { MemoryService } from './memory-service.js';
import { EventBus } from './event-bus.js';
import { TaskMachine } from './task-machine.js';

function makeMockClient() {
  return {
    ensureConnected: vi.fn(),
    listTools: vi.fn().mockResolvedValue([
      { name: 'memory_add' }, { name: 'memory_search' },
    ]),
    callTool: vi.fn().mockResolvedValue([]),
  } as any;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-123',
    assignee: 'agent-worker',
    result: 'task completed successfully',
    status: 'done',
    ...overrides,
  } as any;
}

describe('MemoryService.search namespace passthrough', () => {
  it('public namespace maps to "public/conclusions" as filter field', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('auth refactor', { namespace: 'public', limit: 5 });

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({
        query: 'auth refactor',
        namespace: 'public/conclusions',
        limit: 5,
      }),
    );
  });

  it('agent namespace maps to "agent" as filter field', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('debug logs', { namespace: 'agent', limit: 5 });

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({
        query: 'debug logs',
        namespace: 'agent',
        limit: 5,
      }),
    );
  });

  it('search with agentId filter passes it to memory_search tool', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('recent work', { agentId: 'agent-1' });

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({
        query: 'recent work',
        agentId: 'agent-1',
      }),
    );
  });

  it('search with after/before passes them to memory_search tool', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('task logs', {
      after: '2026-01-01T00:00:00Z',
      before: '2026-03-01T00:00:00Z',
    });

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({
        query: 'task logs',
        after: '2026-01-01T00:00:00Z',
        before: '2026-03-01T00:00:00Z',
      }),
    );
  });

  it('search without options works with defaults', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('anything');

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      { query: 'anything', limit: 10 },
    );
  });
});

describe('MemoryService.writeConclusion', () => {
  it('passes namespace, agentId, taskId as separate tool args', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    const task = makeTask();
    await svc.writeConclusion(task);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_add',
      expect.objectContaining({
        namespace: 'public/conclusions',
        agentId: 'agent-worker',
        taskId: 'task-123',
      }),
    );
  });
});

describe('MemoryService.writeProcess', () => {
  it('passes namespace, agentId, taskId as separate tool args', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    const task = makeTask();
    await svc.writeProcess(task as any, 'agent-worker');

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_add',
      expect.objectContaining({
        namespace: 'agent/agent-worker',
        agentId: 'agent-worker',
        taskId: 'task-123',
      }),
    );
  });
});
