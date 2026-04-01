import { describe, it, expect, vi } from 'vitest';
import { MemoryService } from './memory-service.js';
import { EventBus } from './event-bus.js';
import { TaskMachine } from './task-machine.js';
import type { LlmClient } from '@hive/worker';

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

// --- LLM extraction tests (Plan 05-02) ---

function mockLlmClient(response: string): LlmClient {
  return { query: async () => response };
}

const failingLlmClient: LlmClient = {
  query: async () => { throw new Error('LLM down'); },
};

describe('writeConclusion with LLM extraction', () => {
  it('extracts structured fields via LLM when raw text provided', async () => {
    const mockClient = makeMockClient();
    const llmResponse = JSON.stringify({
      conclusion: 'LLM extracted conclusion',
      decisionReason: 'Used approach A because of X',
      keyFindings: ['finding1', 'finding2'],
      artifacts: ['file.ts'],
      reusableFor: ['similar-campaign', 'ad-optimization'],
    });
    const llm = mockLlmClient(llmResponse);
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine(), llm);
    await svc.init();

    const task = makeTask({ result: 'plain text result that needs extraction' });
    await svc.writeConclusion(task);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_add',
      expect.objectContaining({
        taskId: 'task-123',
      }),
    );

    // Parse the stored content to verify structured fields
    const callArgs = mockClient.callTool.mock.calls[0][1];
    const stored = JSON.parse(callArgs.content);
    expect(stored.conclusion).toBe('LLM extracted conclusion');
    expect(stored.decisionReason).toBe('Used approach A because of X');
    expect(stored.keyFindings).toEqual(['finding1', 'finding2']);
    expect(stored.reusableFor).toEqual(['similar-campaign', 'ad-optimization']);
  });

  it('falls back to raw when LLM client not provided (backward compatible)', async () => {
    const mockClient = makeMockClient();
    // Construct WITHOUT llmClient — 4th param omitted
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();

    const task = makeTask({ result: 'raw result text' });
    await svc.writeConclusion(task);

    const callArgs = mockClient.callTool.mock.calls[0][1];
    const stored = JSON.parse(callArgs.content);
    expect(stored.conclusion).toBe('raw result text');
    expect(stored.decisionReason).toBe('');
    expect(stored.keyFindings).toEqual([]);
    expect(stored.reusableFor).toEqual([]);
  });

  it('falls back to raw when LLM fails (per D-03) — never throws', async () => {
    const mockClient = makeMockClient();
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine(), failingLlmClient);
    await svc.init();

    const task = makeTask({ result: 'some task output' });

    // Should NOT throw
    const ref = await svc.writeConclusion(task);
    expect(ref).not.toBeNull();

    // Should still write with raw fallback
    const callArgs = mockClient.callTool.mock.calls[0][1];
    const stored = JSON.parse(callArgs.content);
    expect(stored.conclusion).toBe('some task output');
    expect(stored.keyFindings).toEqual([]);
    expect(stored.reusableFor).toEqual([]);
  });

  it('includes tags in callTool args from reusableFor (per D-06)', async () => {
    const mockClient = makeMockClient();
    const llmResponse = JSON.stringify({
      conclusion: 'Tagged result',
      decisionReason: 'Reason',
      keyFindings: ['f1'],
      artifacts: [],
      reusableFor: ['tag1', 'tag2'],
    });
    const llm = mockLlmClient(llmResponse);
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine(), llm);
    await svc.init();

    const task = makeTask({ result: 'plain text for tagging' });
    await svc.writeConclusion(task);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'memory_add',
      expect.objectContaining({
        tags: ['tag1', 'tag2'],
      }),
    );
  });

  it('backward compatible — existing constructor without 4th param works', async () => {
    const mockClient = makeMockClient();
    // This must not throw — proves optional param works
    const svc = new MemoryService(mockClient, new EventBus(10), new TaskMachine());
    await svc.init();
    expect(svc.isReady()).toBe(true);

    const task = makeTask();
    const ref = await svc.writeConclusion(task);
    expect(ref).toMatch(/^mem:\/\//);
  });
});
