import { describe, it, expect } from 'vitest';
import { extractStructuredResult } from './extract-result.js';
import { extractWithLLM } from './llm-client.js';
import type { LlmClient } from './llm-client.js';

describe('extractStructuredResult', () => {
  it('parses valid JSON with conclusion field into StructuredResult', () => {
    const input = JSON.stringify({
      conclusion: 'Task completed successfully',
      decisionReason: 'Used approach A',
      keyFindings: ['finding1', 'finding2'],
      artifacts: ['file.ts'],
    });

    const result = extractStructuredResult(input);

    expect(result.conclusion).toBe('Task completed successfully');
    expect(result.decisionReason).toBe('Used approach A');
    expect(result.keyFindings).toEqual(['finding1', 'finding2']);
    expect(result.artifacts).toEqual(['file.ts']);
    expect(result.raw).toBe(input);
  });

  it('falls back to raw wrapping when JSON is valid but missing conclusion field', () => {
    const input = JSON.stringify({ foo: 'bar', data: [1, 2, 3] });

    const result = extractStructuredResult(input);

    expect(result.conclusion).toBe(input);
    expect(result.decisionReason).toBe('');
    expect(result.keyFindings).toEqual([]);
    expect(result.artifacts).toEqual([]);
    expect(result.raw).toBe(input);
  });

  it('falls back to raw wrapping for invalid JSON (plain text)', () => {
    const input = 'This is just plain text output from the CLI';

    const result = extractStructuredResult(input);

    expect(result.conclusion).toBe(input);
    expect(result.decisionReason).toBe('');
    expect(result.keyFindings).toEqual([]);
    expect(result.artifacts).toEqual([]);
    expect(result.raw).toBe(input);
  });

  it('falls back with empty conclusion for empty string input', () => {
    const result = extractStructuredResult('');

    expect(result.conclusion).toBe('');
    expect(result.decisionReason).toBe('');
    expect(result.keyFindings).toEqual([]);
    expect(result.artifacts).toEqual([]);
    expect(result.raw).toBe('');
  });

  it('extracts JSON embedded in markdown code fence', () => {
    const json = {
      conclusion: 'Fenced result',
      decisionReason: 'Wrapped in markdown',
      keyFindings: ['a'],
      artifacts: [],
    };
    const input = `Here is the result:\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\nDone.`;

    const result = extractStructuredResult(input);

    expect(result.conclusion).toBe('Fenced result');
    expect(result.decisionReason).toBe('Wrapped in markdown');
    expect(result.keyFindings).toEqual(['a']);
    expect(result.artifacts).toEqual([]);
    expect(result.raw).toBe(input);
  });
});

describe('extractWithLLM', () => {
  const mockLlm = (response: string): LlmClient => ({
    query: async () => response,
  });
  const failLlm: LlmClient = {
    query: async () => { throw new Error('API down'); },
  };

  it('returns local result when JSON parse succeeds (no LLM call)', async () => {
    const input = JSON.stringify({
      conclusion: 'Local parsed',
      decisionReason: 'Already structured',
      keyFindings: ['f1'],
      artifacts: [],
    });
    let llmCalled = false;
    const spyLlm: LlmClient = {
      query: async () => { llmCalled = true; return ''; },
    };

    const result = await extractWithLLM(input, spyLlm);

    expect(result.conclusion).toBe('Local parsed');
    expect(result.decisionReason).toBe('Already structured');
    expect(llmCalled).toBe(false);
  });

  it('calls LLM when local extraction is rawFallback', async () => {
    const raw = 'plain text that is not JSON';
    const llmJson = JSON.stringify({
      conclusion: 'LLM extracted',
      decisionReason: 'Parsed by Haiku',
      keyFindings: ['insight'],
      artifacts: ['file.ts'],
    });
    const llm = mockLlm(llmJson);

    const result = await extractWithLLM(raw, llm);

    expect(result.conclusion).toBe('LLM extracted');
    expect(result.decisionReason).toBe('Parsed by Haiku');
    expect(result.keyFindings).toEqual(['insight']);
    expect(result.raw).toBe(raw); // original raw preserved
  });

  it('returns rawFallback when LLM also fails (per D-03)', async () => {
    const raw = 'unstructured output';

    const result = await extractWithLLM(raw, failLlm);

    expect(result.conclusion).toBe(raw);
    expect(result.decisionReason).toBe('');
    expect(result.keyFindings).toEqual([]);
    expect(result.artifacts).toEqual([]);
  });

  it('returns rawFallback when LLM returns non-JSON', async () => {
    const raw = 'some task output';
    const llm = mockLlm('I could not parse that into structured format');

    const result = await extractWithLLM(raw, llm);

    expect(result.conclusion).toBe(raw);
    expect(result.decisionReason).toBe('');
  });

  it('keeps original raw field even when LLM extracts structure', async () => {
    const raw = 'the original task output text';
    const llmJson = JSON.stringify({
      conclusion: 'Summarized',
      decisionReason: 'Because reasons',
      keyFindings: [],
      artifacts: [],
    });
    const llm = mockLlm(llmJson);

    const result = await extractWithLLM(raw, llm);

    expect(result.conclusion).toBe('Summarized');
    expect(result.raw).toBe(raw);
  });
});
