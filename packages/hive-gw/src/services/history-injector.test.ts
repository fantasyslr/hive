import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, MemoryConclusion } from '@hive/shared';
import { HistoryInjector } from './history-injector.js';
import type { MemoryService } from './memory-service.js';

/** Minimal LlmClient interface matching @hive/worker */
interface LlmClient {
  query(prompt: string): Promise<string>;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Deploy marketing site',
    description: 'Set up and deploy the new marketing landing page',
    requiredCapabilities: ['code'],
    status: 'pending',
    assignee: null,
    createdBy: 'user-1',
    result: null,
    error: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConclusion(taskId: string, score: number, overrides: Partial<MemoryConclusion> = {}): { content: string; score: number } {
  const conclusion: MemoryConclusion = {
    taskId,
    agentId: 'agent-1',
    conclusion: `Conclusion for ${taskId}`,
    decisionReason: `Reason for ${taskId}`,
    impactScope: 'team',
    timestamp: '2026-01-01T00:00:00Z',
    namespace: `public/conclusions/${taskId}`,
    reusableFor: ['deploy', 'marketing'],
    keyFindings: ['finding1'],
    ...overrides,
  };
  return { content: JSON.stringify(conclusion), score };
}

function mockMemoryService(results: Array<{ content: string; score: number }> | Error = []): MemoryService {
  const search = results instanceof Error
    ? vi.fn().mockRejectedValue(results)
    : vi.fn().mockResolvedValue(results);
  return { search } as unknown as MemoryService;
}

function mockLlmClient(response: string | Error = '[]'): LlmClient {
  const query = response instanceof Error
    ? vi.fn().mockRejectedValue(response)
    : vi.fn().mockResolvedValue(response);
  return { query };
}

describe('HistoryInjector', () => {
  it('returns top-3 by score when all scores >= 0.3', async () => {
    const hits = [
      makeConclusion('t1', 0.9),
      makeConclusion('t2', 0.7),
      makeConclusion('t3', 0.5),
      makeConclusion('t4', 0.4),
    ];
    const memService = mockMemoryService(hits);
    const injector = new HistoryInjector(memService);

    const result = await injector.inject(makeTask());

    expect(result).toHaveLength(3);
    expect(result[0].taskId).toBe('t1');
    expect(result[1].taskId).toBe('t2');
    expect(result[2].taskId).toBe('t3');
    expect(result[0].similarity).toBe(0.9);
  });

  it('triggers LLM re-ranking when any score < 0.3 (per D-10)', async () => {
    const hits = [
      makeConclusion('t1', 0.5),
      makeConclusion('t2', 0.25), // below threshold
      makeConclusion('t3', 0.4),
      makeConclusion('t4', 0.35),
    ];
    const memService = mockMemoryService(hits);
    const llm = mockLlmClient(JSON.stringify(['t3', 't1', 't4']));
    const injector = new HistoryInjector(memService, llm);

    const result = await injector.inject(makeTask());

    expect(llm.query).toHaveBeenCalledOnce();
    expect(result).toHaveLength(3);
    // LLM re-ranked order
    expect(result[0].taskId).toBe('t3');
    expect(result[1].taskId).toBe('t1');
    expect(result[2].taskId).toBe('t4');
  });

  it('falls back to vector scores when LLM re-ranking fails', async () => {
    const hits = [
      makeConclusion('t1', 0.5),
      makeConclusion('t2', 0.2), // below threshold
      makeConclusion('t3', 0.4),
      makeConclusion('t4', 0.35),
    ];
    const memService = mockMemoryService(hits);
    const llm = mockLlmClient(new Error('LLM down'));
    const injector = new HistoryInjector(memService, llm);

    const result = await injector.inject(makeTask());

    expect(result).toHaveLength(3);
    // Fallback to vector order: t1 > t3 > t4
    expect(result[0].taskId).toBe('t1');
    expect(result[1].taskId).toBe('t3');
    expect(result[2].taskId).toBe('t4');
  });

  it('returns empty array when no search results (per D-11)', async () => {
    const memService = mockMemoryService([]);
    const injector = new HistoryInjector(memService);

    const result = await injector.inject(makeTask());

    expect(result).toEqual([]);
  });

  it('returns empty array on search error — never throws', async () => {
    const memService = mockMemoryService(new Error('Memory backend down'));
    const injector = new HistoryInjector(memService);

    const result = await injector.inject(makeTask());

    expect(result).toEqual([]);
  });

  it('parses MemoryConclusion from search hit content JSON', async () => {
    const hits = [
      makeConclusion('t1', 0.8, {
        conclusion: 'Deployed to staging successfully',
        decisionReason: 'Staging was fastest path',
        reusableFor: ['deploy', 'staging'],
      }),
    ];
    const memService = mockMemoryService(hits);
    const injector = new HistoryInjector(memService);

    const result = await injector.inject(makeTask());

    expect(result).toHaveLength(1);
    expect(result[0].conclusion).toBe('Deployed to staging successfully');
    expect(result[0].decisionReason).toBe('Staging was fastest path');
    expect(result[0].reusableFor).toEqual(['deploy', 'staging']);
    expect(result[0].similarity).toBe(0.8);
  });

  it('works without LlmClient (vector-only mode)', async () => {
    const hits = [
      makeConclusion('t1', 0.5),
      makeConclusion('t2', 0.2), // below threshold, but no LLM
      makeConclusion('t3', 0.4),
      makeConclusion('t4', 0.35),
    ];
    const memService = mockMemoryService(hits);
    // No LLM client — should fall back to vector-only
    const injector = new HistoryInjector(memService);

    const result = await injector.inject(makeTask());

    expect(result).toHaveLength(3);
    // Pure vector order: t1 > t3 > t4
    expect(result[0].taskId).toBe('t1');
    expect(result[1].taskId).toBe('t3');
    expect(result[2].taskId).toBe('t4');
  });
});
