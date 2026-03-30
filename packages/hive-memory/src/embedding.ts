const DEFAULT_DIMENSIONS = 384;

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hashToken(token: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const tokens: string[] = [];
  const wordMatches = normalized.match(/[\p{Letter}\p{Number}_-]+/gu) ?? [];
  tokens.push(...wordMatches);

  const compact = normalized.replace(/\s+/g, '');
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i <= compact.length - size; i++) {
      tokens.push(compact.slice(i, i + size));
    }
  }

  return tokens;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) {
      intersection++;
    }
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface EmbeddingEngine {
  readonly dimensions: number;
  readonly name: string;
  embed(text: string): number[];
  score(query: string, document: string, storedEmbedding?: number[]): number;
}

export class HashEmbeddingEngine implements EmbeddingEngine {
  readonly dimensions: number;
  readonly name = 'hash-v1';

  constructor(dimensions = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions;
  }

  embed(text: string): number[] {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vector;

    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const [token, count] of counts.entries()) {
      const index = hashToken(token, 2166136261) % this.dimensions;
      const sign = (hashToken(token, 16777619) & 1) === 0 ? 1 : -1;
      const weight = 1 + Math.log1p(count);
      vector[index] += sign * weight;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) return vector;
    return vector.map((value) => value / norm);
  }

  score(query: string, document: string, storedEmbedding?: number[]): number {
    const queryEmbedding = this.embed(query);
    const documentEmbedding = storedEmbedding ?? this.embed(document);
    const tokenScore = jaccardSimilarity(tokenize(query), tokenize(document));
    const vectorScore = cosineSimilarity(queryEmbedding, documentEmbedding);
    const normalizedQuery = normalizeText(query);
    const normalizedDocument = normalizeText(document);
    const exactBoost = normalizedQuery && normalizedDocument.includes(normalizedQuery) ? 0.35 : 0;
    if (tokenScore === 0 && exactBoost === 0 && vectorScore < 0.45) {
      return 0;
    }
    return vectorScore * 0.75 + tokenScore * 0.25 + exactBoost;
  }
}
