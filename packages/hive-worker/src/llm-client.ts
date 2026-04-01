import type { StructuredResult } from './types.js';
import { extractStructuredResult } from './extract-result.js';

/** Injectable LLM client interface for testability */
export interface LlmClient {
  query(prompt: string): Promise<string>;
}

const EXTRACTION_PROMPT = `Extract structured fields from this task result. Return ONLY valid JSON:
{"conclusion": "one-sentence summary", "decisionReason": "why this approach", "keyFindings": ["finding1", ...], "artifacts": ["path1", ...], "reusableFor": ["tag1", ...]}

Task result:
`;

/**
 * Two-pass structured result extraction with LLM fallback.
 * Pass 1: Try local JSON extraction via extractStructuredResult.
 * Pass 2: If local extraction yields rawFallback, call LLM for structured extraction.
 * Per D-03: extraction failure never blocks — returns rawFallback.
 */
export async function extractWithLLM(raw: string, llmClient: LlmClient): Promise<StructuredResult> {
  // First try local JSON extraction
  const local = extractStructuredResult(raw);
  // If local extraction got real fields (not rawFallback), use it
  if (local.conclusion !== raw || local.decisionReason !== '') {
    return local;
  }

  // LLM pass — per D-03, failure returns rawFallback
  try {
    const llmResponse = await llmClient.query(EXTRACTION_PROMPT + raw);
    const extracted = extractStructuredResult(llmResponse);
    // If LLM gave us better structure, use it but keep original raw
    if (extracted.conclusion !== llmResponse || extracted.decisionReason !== '') {
      return { ...extracted, raw };
    }
    // LLM didn't return parseable JSON — rawFallback
    return { conclusion: raw, decisionReason: '', keyFindings: [], artifacts: [], reusableFor: [], raw };
  } catch {
    // Per D-03: extraction failure never blocks — return rawFallback
    return { conclusion: raw, decisionReason: '', keyFindings: [], artifacts: [], reusableFor: [], raw };
  }
}

/** Create an LlmClient that calls Claude Haiku via Anthropic API */
export function createHaikuClient(apiKey: string, baseUrl = 'https://api.anthropic.com'): LlmClient {
  return {
    async query(prompt: string): Promise<string> {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-0',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Haiku API ${res.status}: ${await res.text()}`);
      const json = await res.json() as { content: Array<{ text: string }> };
      return json.content[0]?.text ?? '';
    },
  };
}
