import type { StructuredResult } from './types.js';

/** Fallback result when parsing fails — per D-10 */
function rawFallback(raw: string): StructuredResult {
  return {
    conclusion: raw,
    decisionReason: '',
    keyFindings: [],
    artifacts: [],
    reusableFor: [],
    raw,
  };
}

/**
 * Two-pass structured result extraction.
 * Pass 1: Try JSON.parse on raw output (or extracted from markdown fence).
 * Pass 2 (future, D-11): Side query to LLM — not implemented in Phase 4,
 *   will be added in Phase 5 (SMEM). For now, falls back to rawFallback.
 *
 * Reusable utility per D-11 — Phase 5 SMEM will import this.
 */
export function extractStructuredResult(raw: string): StructuredResult {
  const trimmed = raw.trim();
  if (!trimmed) return rawFallback('');

  // Try to extract JSON from markdown code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonCandidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    const parsed = JSON.parse(jsonCandidate);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.conclusion === 'string') {
      return {
        conclusion: parsed.conclusion,
        decisionReason: parsed.decisionReason ?? '',
        keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        reusableFor: Array.isArray(parsed.reusableFor) ? parsed.reusableFor : [],
        raw,
      };
    }
  } catch {
    // JSON parse failed — fall through to raw fallback
  }

  return rawFallback(raw);
}
