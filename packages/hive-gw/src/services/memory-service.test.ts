import { describe, it, expect, vi } from 'vitest';
import { MemoryService } from './memory-service.js';
import { EventBus } from './event-bus.js';
import { TaskMachine } from './task-machine.js';

describe('MemoryService.search namespace passthrough', () => {
  it('passes namespace as query prefix to underlying tool', async () => {
    const mockClient = {
      ensureConnected: vi.fn(),
      listTools: vi.fn().mockResolvedValue([
        { name: 'memory_add' }, { name: 'memory_search' },
      ]),
      callTool: vi.fn().mockResolvedValue([]),
    } as any;
    const bus = new EventBus(10);
    const tm = new TaskMachine();
    const svc = new MemoryService(mockClient, bus, tm);
    await svc.init();

    await svc.search('auth refactor', 'public', 5);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({ query: expect.stringContaining('public') }),
    );
  });

  it('passes agent namespace prefix when searching agent scope', async () => {
    const mockClient = {
      ensureConnected: vi.fn(),
      listTools: vi.fn().mockResolvedValue([
        { name: 'memory_add' }, { name: 'memory_search' },
      ]),
      callTool: vi.fn().mockResolvedValue([]),
    } as any;
    const bus = new EventBus(10);
    const tm = new TaskMachine();
    const svc = new MemoryService(mockClient, bus, tm);
    await svc.init();

    await svc.search('debug logs', 'agent', 5);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_search',
      expect.objectContaining({ query: expect.stringContaining('agent') }),
    );
  });
});
