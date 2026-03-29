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

describe('MemoryService.search namespace passthrough', () => {
  it('public namespace maps to "public/conclusions" storage path', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('auth refactor', 'public', 5);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({ query: 'public/conclusions auth refactor' }),
    );
  });

  it('agent namespace maps to "agent" storage path', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    await svc.search('debug logs', 'agent', 5);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({ query: 'agent debug logs' }),
    );
  });
});
