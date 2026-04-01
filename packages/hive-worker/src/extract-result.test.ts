import { describe, it, expect } from 'vitest';
import { extractStructuredResult } from './extract-result.js';

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
