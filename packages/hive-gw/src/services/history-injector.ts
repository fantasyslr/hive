import type { Task, HistoryContext, MemoryConclusion } from '@hive/shared';
import type { MemoryService } from './memory-service.js';
import { logger } from '../config.js';

/** Minimal LLM client interface — matches @hive/worker LlmClient */
export interface LlmClient {
  query(prompt: string): Promise<string>;
}

const COSINE_THRESHOLD = 0.3; // Per D-10
const TOP_K = 3;
const CANDIDATE_POOL = 10; // Per D-10: top-10 for LLM re-ranking

const RERANK_PROMPT = `Given this task, select the 3 most relevant prior conclusions. Return ONLY a JSON array of taskId strings, most relevant first.

Task: {title} — {description}

Candidates:
{candidates}

Return: ["taskId1", "taskId2", "taskId3"]`;

export class HistoryInjector {
  constructor(
    private memoryService: MemoryService,
    private llmClient: LlmClient | null = null,
  ) {}

  async inject(task: Task): Promise<HistoryContext[]> {
    try {
      const query = `${task.title} ${task.description}`;
      const results = (await this.memoryService.search(query, {
        namespace: 'public',
        limit: CANDIDATE_POOL,
      })) as Array<{ content: string; score: number }>;

      if (!Array.isArray(results) || results.length === 0) return [];

      // Parse candidates
      const candidates = results
        .map((hit) => {
          try {
            const parsed = JSON.parse(hit.content) as MemoryConclusion;
            return { ...parsed, similarity: hit.score };
          } catch {
            return null;
          }
        })
        .filter((c): c is MemoryConclusion & { similarity: number } => c !== null);

      if (candidates.length === 0) return [];

      // Check if any score below threshold — dual-channel per D-10, HINJ-03
      const hasLowScores = candidates.some((c) => c.similarity < COSINE_THRESHOLD);

      let selected: typeof candidates;
      if (hasLowScores && this.llmClient && candidates.length > TOP_K) {
        selected = await this.rerankWithLLM(task, candidates);
      } else {
        selected = candidates.sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K);
      }

      return selected.map((c) => ({
        taskId: c.taskId,
        conclusion: c.conclusion,
        decisionReason: c.decisionReason,
        reusableFor: c.reusableFor ?? [],
        similarity: c.similarity,
      }));
    } catch (err) {
      // Per D-11: injection never blocks
      logger.warn({ err, taskId: task.id }, 'History injection failed, proceeding without context');
      return [];
    }
  }

  private async rerankWithLLM(
    task: Task,
    candidates: Array<MemoryConclusion & { similarity: number }>,
  ): Promise<Array<MemoryConclusion & { similarity: number }>> {
    if (!this.llmClient) {
      return candidates.sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K);
    }

    try {
      const candidateText = candidates
        .map((c) => `- taskId: ${c.taskId} | conclusion: ${c.conclusion}`)
        .join('\n');

      const prompt = RERANK_PROMPT.replace('{title}', task.title)
        .replace('{description}', task.description)
        .replace('{candidates}', candidateText);

      const response = await this.llmClient.query(prompt);
      const selectedIds: string[] = JSON.parse(response);

      // Map back to candidates preserving original scores
      const reranked = selectedIds
        .map((id) => candidates.find((c) => c.taskId === id))
        .filter((c): c is MemoryConclusion & { similarity: number } => c !== undefined)
        .slice(0, TOP_K);

      return reranked.length > 0
        ? reranked
        : candidates.sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K);
    } catch (err) {
      logger.warn({ err }, 'LLM re-ranking failed, falling back to vector scores');
      return candidates.sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K);
    }
  }
}
