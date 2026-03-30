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
});
