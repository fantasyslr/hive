import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { EmbeddingEngine, HashEmbeddingEngine, normalizeText } from './embedding.js';

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHit extends MemoryRecord {
  score: number;
}

interface MemoryRow {
  id: string;
  title: string;
  content: string;
  embedding: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function ensureParentDir(dbPath: string): void {
  if (dbPath === ':memory:') return;
  mkdirSync(dirname(dbPath), { recursive: true });
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore broken metadata blobs; keep the store readable.
  }
  return {};
}

function serializeEmbedding(vector: number[]): string {
  return JSON.stringify(vector);
}

function deserializeEmbedding(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => Number(value) || 0);
    }
  } catch {
    // Ignore malformed rows and let them score as zero.
  }
  return [];
}

function buildSearchText(title: string, content: string, metadata: Record<string, unknown>): string {
  const metadataText = Object.entries(metadata)
    .map(([key, value]) => `${key}:${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');
  return [title, content, metadataText].filter(Boolean).join('\n');
}

function nextTimestamp(after?: string): string {
  const now = Date.now();
  const min = after ? Date.parse(after) + 1 : now;
  return new Date(Math.max(now, min)).toISOString();
}

export class MemoryStore {
  private readonly db: DatabaseSync;
  private readonly embedding: EmbeddingEngine;

  constructor(dbPath: string, embedding: EmbeddingEngine = new HashEmbeddingEngine()) {
    ensureParentDir(dbPath);
    this.db = new DatabaseSync(dbPath);
    this.embedding = embedding;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_title_updated
        ON memories (title, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_updated
        ON memories (updated_at DESC);
    `);
  }

  close(): void {
    this.db.close();
  }

  add(params: {
    title?: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): MemoryRecord {
    const id = randomUUID();
    const now = nextTimestamp();
    const title = params.title ?? '';
    const metadata = params.metadata ?? {};
    const embedding = serializeEmbedding(this.embedding.embed(buildSearchText(title, params.content, metadata)));

    this.db.prepare(`
      INSERT INTO memories (id, title, content, embedding, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, params.content, embedding, JSON.stringify(metadata), now, now);

    return {
      id,
      title,
      content: params.content,
      metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(id: string): MemoryRecord | null {
    const row = this.db.prepare(`
      SELECT id, title, content, metadata, created_at, updated_at
      FROM memories
      WHERE id = ?
    `).get(id) as Partial<MemoryRow> | undefined;

    if (!row?.id || row.title === undefined || row.content === undefined || !row.created_at || !row.updated_at) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      metadata: parseMetadata(row.metadata ?? '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  update(params: {
    id: string;
    title?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }): MemoryRecord {
    const existing = this.get(params.id);
    if (!existing) {
      throw new Error(`Memory ${params.id} not found`);
    }

    const next: MemoryRecord = {
      ...existing,
      title: params.title ?? existing.title,
      content: params.content ?? existing.content,
      metadata: params.metadata ?? existing.metadata,
      updatedAt: nextTimestamp(existing.updatedAt),
    };

    const embedding = serializeEmbedding(
      this.embedding.embed(buildSearchText(next.title, next.content, next.metadata)),
    );

    this.db.prepare(`
      UPDATE memories
      SET title = ?, content = ?, embedding = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.title,
      next.content,
      embedding,
      JSON.stringify(next.metadata),
      next.updatedAt,
      next.id,
    );

    return next;
  }

  search(query: string, limit = 10): SearchHit[] {
    const rows = this.db.prepare(`
      SELECT id, title, content, embedding, metadata, created_at, updated_at
      FROM memories
      ORDER BY updated_at DESC
    `).all() as unknown as MemoryRow[];

    const scored = rows
      .map((row) => {
        const metadata = parseMetadata(row.metadata);
        const searchText = buildSearchText(row.title, row.content, metadata);
        const normalizedTitle = normalizeText(row.title);
        const normalizedQuery = normalizeText(query);
        const exactTitleMatch = normalizedTitle === normalizedQuery;
        const prefixBoost = !exactTitleMatch && normalizedTitle.includes(normalizedQuery) ? 1.5 : 0;
        const score = exactTitleMatch
          ? 1000
          : prefixBoost + this.embedding.score(query, searchText, deserializeEmbedding(row.embedding));
        return {
          id: row.id,
          title: row.title,
          content: row.content,
          metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          score,
        } satisfies SearchHit;
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.updatedAt.localeCompare(a.updatedAt);
      });

    return scored.slice(0, limit);
  }
}
