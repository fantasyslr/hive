import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStore } from './store.js';

const stores: MemoryStore[] = [];

afterEach(() => {
  while (stores.length > 0) {
    stores.pop()?.close();
  }
});

function makeStore(): MemoryStore {
  const store = new MemoryStore(':memory:');
  stores.push(store);
  return store;
}

describe('MemoryStore', () => {
  it('returns the latest matching board snapshot for exact title queries', async () => {
    const store = makeStore();

    store.add({
      title: 'public/board/snapshot',
      content: JSON.stringify({ agents: [], tasks: [], timestamp: '2026-03-28T00:00:00.000Z' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const latest = store.add({
      title: 'public/board/snapshot',
      content: JSON.stringify({ agents: [{ agent_id: 'a' }], tasks: [], timestamp: '2026-03-29T00:00:00.000Z' }),
    });

    const results = store.search('public/board/snapshot', 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(latest.id);
  });

  it('can update an existing memory and search the revised content', () => {
    const store = makeStore();
    const record = store.add({
      title: 'public/conclusions/task-1',
      content: 'Customer prefers dark theme dashboards.',
    });

    const updated = store.update({
      id: record.id,
      content: 'Customer prefers dark theme dashboards and compact tables.',
    });

    expect(updated.updatedAt).not.toBe(record.updatedAt);

    const results = store.search('compact tables', 5);
    expect(results.some((row) => row.id === record.id)).toBe(true);
  });

  // --- Task 1: namespace, source metadata, TTL, filtered search ---

  it('stores and retrieves namespace, agentId, taskId fields', () => {
    const store = makeStore();
    const record = store.add({
      namespace: 'public/conclusions',
      agentId: 'agent-alpha',
      taskId: 'task-42',
      content: 'Decision about color scheme.',
    });

    expect(record.namespace).toBe('public/conclusions');
    expect(record.agentId).toBe('agent-alpha');
    expect(record.taskId).toBe('task-42');

    const fetched = store.get(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.namespace).toBe('public/conclusions');
    expect(fetched!.agentId).toBe('agent-alpha');
    expect(fetched!.taskId).toBe('task-42');
  });

  it('defaults namespace to empty string when not provided', () => {
    const store = makeStore();
    const record = store.add({ content: 'No namespace given.' });

    expect(record.namespace).toBe('');
    expect(record.agentId).toBeUndefined();
    expect(record.taskId).toBeUndefined();
  });

  it('excludes entries with expired TTL from search results', async () => {
    const store = makeStore();
    store.add({
      content: 'Ephemeral note about sprint status.',
      ttlMs: 100,
    });

    // Before expiry — should be found
    const before = store.search('sprint status', 10);
    expect(before).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 150));

    // After expiry — should be excluded
    const after = store.search('sprint status', 10);
    expect(after).toHaveLength(0);
  });

  it('never expires entries without ttlMs', async () => {
    const store = makeStore();
    store.add({ content: 'Permanent memory about architecture.' });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const results = store.search('architecture', 10);
    expect(results).toHaveLength(1);
  });

  it('filters search results by namespace', () => {
    const store = makeStore();
    store.add({ namespace: 'ns1', content: 'Alpha bravo charlie.' });
    store.add({ namespace: 'ns2', content: 'Alpha bravo delta.' });

    const results = store.search('alpha bravo', 10, { namespace: 'ns1' });
    expect(results).toHaveLength(1);
    expect(results[0].namespace).toBe('ns1');
  });

  it('filters search results by agentId', () => {
    const store = makeStore();
    store.add({ agentId: 'agent-a', content: 'Report on conversion rates.' });
    store.add({ agentId: 'agent-b', content: 'Report on conversion metrics.' });

    const results = store.search('conversion', 10, { agentId: 'agent-a' });
    expect(results).toHaveLength(1);
    expect(results[0].agentId).toBe('agent-a');
  });

  it('filters search results by time range', () => {
    const store = makeStore();
    const r1 = store.add({ content: 'Early note about pricing.' });
    // Force a later timestamp
    const r2 = store.add({ content: 'Late note about pricing strategy.' });

    const results = store.search('pricing', 10, {
      after: r1.createdAt,
      before: new Date(Date.now() + 60_000).toISOString(),
    });
    // r1.createdAt is exclusive lower bound, so only r2 matches
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.createdAt > r1.createdAt)).toBe(true);
  });

  it('existing title-based search still works with new signature', () => {
    const store = makeStore();
    store.add({
      title: 'public/board/snapshot',
      content: JSON.stringify({ agents: [], timestamp: '2026-03-30' }),
    });

    // Old signature: search(query, limit) — no filter arg
    const results = store.search('public/board/snapshot', 1);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('public/board/snapshot');
  });
});
