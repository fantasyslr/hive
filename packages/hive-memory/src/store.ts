import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { EmbeddingEngine, HashEmbeddingEngine, normalizeText, cosineSimilarity } from './embedding.js';

export type { MemoryRecord, SearchHit, SearchFilter } from '@hive/shared';
import type { MemoryRecord, SearchHit, SearchFilter } from '@hive/shared';

interface MemoryRow {
  id: string;
  title: string;
  content: string;
  embedding: string;
  namespace: string;
  agent_id: string | null;
  task_id: string | null;
  expires_at: string | null;
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

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    namespace: row.namespace ?? '',
    agentId: row.agent_id ?? undefined,
    taskId: row.task_id ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    metadata: parseMetadata(row.metadata ?? '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MemoryStore {
  private readonly db: DatabaseSync;
  private readonly embedding: EmbeddingEngine;
  private lastTimestamp = '';

  constructor(dbPath: string, embedding: EmbeddingEngine = new HashEmbeddingEngine()) {
    ensureParentDir(dbPath);
    this.db = new DatabaseSync(dbPath);
    this.embedding = embedding;
    this.migrate();
  }

  /** Generate a monotonically increasing ISO timestamp. */
  private nextTs(after?: string): string {
    const ts = nextTimestamp(after ?? (this.lastTimestamp || undefined));
    this.lastTimestamp = ts;
    return ts;
  }

  private migrate(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT '',
        agent_id TEXT,
        task_id TEXT,
        expires_at TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_title_updated
        ON memories (title, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_updated
        ON memories (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_namespace
        ON memories (namespace);
    `);

    // Migration: add columns if table existed before these columns were added
    const columns = this.db.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
    const colNames = new Set(columns.map((c) => c.name));
    if (!colNames.has('namespace')) {
      this.db.exec("ALTER TABLE memories ADD COLUMN namespace TEXT NOT NULL DEFAULT ''");
    }
    if (!colNames.has('agent_id')) {
      this.db.exec("ALTER TABLE memories ADD COLUMN agent_id TEXT");
    }
    if (!colNames.has('task_id')) {
      this.db.exec("ALTER TABLE memories ADD COLUMN task_id TEXT");
    }
    if (!colNames.has('expires_at')) {
      this.db.exec("ALTER TABLE memories ADD COLUMN expires_at TEXT");
    }
  }

  close(): void {
    this.db.close();
  }

  add(params: {
    title?: string;
    content: string;
    namespace?: string;
    agentId?: string;
    taskId?: string;
    ttlMs?: number;
    metadata?: Record<string, unknown>;
  }): MemoryRecord {
    const namespace = params.namespace ?? '';

    // Dedup: if similar content exists in the same namespace, update instead of insert
    if (namespace) {
      const duplicate = this.findDuplicate(namespace, params.content);
      if (duplicate) {
        const mergedMetadata = { ...parseMetadata(duplicate.metadata), ...params.metadata };
        return this.update({
          id: duplicate.id,
          title: params.title ?? duplicate.title,
          content: params.content,
          metadata: mergedMetadata,
        });
      }
    }

    const id = randomUUID();
    const now = this.nextTs();
    const title = params.title ?? '';
    const metadata = params.metadata ?? {};
    const expiresAt = params.ttlMs != null ? new Date(Date.now() + params.ttlMs).toISOString() : null;
    const embedding = serializeEmbedding(this.embedding.embed(buildSearchText(title, params.content, metadata)));

    this.db.prepare(`
      INSERT INTO memories (id, title, content, embedding, namespace, agent_id, task_id, expires_at, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, title, params.content, embedding, namespace,
      params.agentId ?? null, params.taskId ?? null, expiresAt,
      JSON.stringify(metadata), now, now,
    );

    return {
      id,
      title,
      content: params.content,
      namespace,
      agentId: params.agentId,
      taskId: params.taskId,
      expiresAt: expiresAt ?? undefined,
      metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(id: string): MemoryRecord | null {
    const row = this.db.prepare(`
      SELECT id, title, content, namespace, agent_id, task_id, expires_at, metadata, created_at, updated_at
      FROM memories
      WHERE id = ?
    `).get(id) as MemoryRow | undefined;

    if (!row) return null;
    return rowToRecord(row);
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
      updatedAt: this.nextTs(existing.updatedAt),
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

  /**
   * Find a duplicate entry in the same namespace by cosine similarity of embeddings.
   * Returns the matching row if similarity > threshold, or null.
   */
  findDuplicate(namespace: string, content: string, threshold = 0.85): MemoryRow | null {
    const rows = this.db.prepare(`
      SELECT id, title, content, embedding, namespace, agent_id, task_id, expires_at, metadata, created_at, updated_at
      FROM memories
      WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)
    `).all(namespace, new Date().toISOString()) as unknown as MemoryRow[];

    const newEmbedding = this.embedding.embed(content);

    for (const row of rows) {
      const existingEmbedding = deserializeEmbedding(row.embedding);
      const similarity = cosineSimilarity(newEmbedding, existingEmbedding);
      if (similarity > threshold) {
        return row;
      }
    }

    return null;
  }

  search(query: string, limit = 10, filter?: SearchFilter): SearchHit[] {
    // Build WHERE clause
    const conditions: string[] = [];
    const bindParams: unknown[] = [];

    // Always exclude expired entries — compare ISO strings directly
    conditions.push('(expires_at IS NULL OR expires_at > ?)');
    bindParams.push(new Date().toISOString());

    if (filter?.namespace != null) {
      conditions.push('namespace = ?');
      bindParams.push(filter.namespace);
    }
    if (filter?.agentId != null) {
      conditions.push('agent_id = ?');
      bindParams.push(filter.agentId);
    }
    if (filter?.after != null) {
      conditions.push('created_at > ?');
      bindParams.push(filter.after);
    }
    if (filter?.before != null) {
      conditions.push('created_at < ?');
      bindParams.push(filter.before);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db.prepare(`
      SELECT id, title, content, embedding, namespace, agent_id, task_id, expires_at, metadata, created_at, updated_at
      FROM memories
      ${whereClause}
      ORDER BY updated_at DESC
    `).all(...bindParams) as unknown as MemoryRow[];

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
          ...rowToRecord(row),
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
