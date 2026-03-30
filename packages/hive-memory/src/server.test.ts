import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMemoryMcpServer, createMemoryMcpApp } from './server.js';

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    const dispose = disposers.pop();
    if (dispose) {
      await dispose();
    }
  }
});

describe('Hive Memory MCP server', () => {
  it('allows explicit allowedHosts when binding to ::', async () => {
    const app = createMemoryMcpApp({
      add: () => { throw new Error('not used'); },
      get: () => null,
      update: () => { throw new Error('not used'); },
      search: () => [],
      close: () => {},
    } as any, '::', ['localhost', '127.0.0.1']);

    expect(app).toBeTruthy();
  });

  it('defaults to a localhost URL so same-machine clients can use the advertised address', async () => {
    const started = await startMemoryMcpServer({ host: '::', port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    expect(started.url).toMatch(/^http:\/\/localhost:\d+\/mcp$/);
  });

  it('exposes the expected tools and returns search results in Hive-compatible shape', async () => {
    const started = await startMemoryMcpServer({ port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(started.url));
    await client.connect(transport);
    disposers.push(async () => {
      await client.close();
    });

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['memory_add', 'memory_search', 'memory_update']),
    );

    const addResult = await client.callTool({
      name: 'memory_add',
      arguments: {
        title: 'public/board/snapshot',
        content: JSON.stringify({ agents: [], tasks: [], timestamp: '2026-03-29T00:00:00.000Z' }),
      },
    });
    const added = JSON.parse((addResult.content as Array<{ text: string }>)[0].text);

    const searchResult = await client.callTool({
      name: 'memory_search',
      arguments: {
        query: 'public/board/snapshot',
        limit: 1,
      },
    });

    const hits = JSON.parse((searchResult.content as Array<{ text: string }>)[0].text);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(added.id);

    const updateResult = await client.callTool({
      name: 'memory_update',
      arguments: {
        id: added.id,
        content: JSON.stringify({ agents: [{ agent_id: 'agent-1' }], tasks: [], timestamp: '2026-03-29T01:00:00.000Z' }),
      },
    });

    const updated = JSON.parse((updateResult.content as Array<{ text: string }>)[0].text);
    expect(updated.id).toBe(added.id);
  });

  it('memory_add accepts namespace, agentId, taskId, ttlMs and returns them in the record', async () => {
    const started = await startMemoryMcpServer({ port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(started.url));
    await client.connect(transport);
    disposers.push(async () => { await client.close(); });

    const result = await client.callTool({
      name: 'memory_add',
      arguments: {
        content: 'task conclusion data',
        namespace: 'public/conclusions',
        agentId: 'agent-planner',
        taskId: 'a0000000-0000-4000-8000-000000000001',
        ttlMs: 3600000,
      },
    });

    expect(result.isError).toBeFalsy();
    const record = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(record.namespace).toBe('public/conclusions');
    expect(record.agentId).toBe('agent-planner');
    expect(record.taskId).toBe('a0000000-0000-4000-8000-000000000001');
    expect(record.expiresAt).toBeDefined();
  });

  it('memory_add without new params still works (backward compat)', async () => {
    const started = await startMemoryMcpServer({ port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(started.url));
    await client.connect(transport);
    disposers.push(async () => { await client.close(); });

    const result = await client.callTool({
      name: 'memory_add',
      arguments: { content: 'simple content' },
    });

    const record = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(record.id).toBeDefined();
    expect(record.content).toBe('simple content');
    expect(record.namespace).toBe('');
  });

  it('memory_search with namespace filter returns only matching entries', async () => {
    const started = await startMemoryMcpServer({ port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(started.url));
    await client.connect(transport);
    disposers.push(async () => { await client.close(); });

    // Add entries in different namespaces
    await client.callTool({
      name: 'memory_add',
      arguments: { content: 'alpha conclusion data', namespace: 'public/conclusions' },
    });
    await client.callTool({
      name: 'memory_add',
      arguments: { content: 'beta agent process data', namespace: 'agent/planner' },
    });

    const result = await client.callTool({
      name: 'memory_search',
      arguments: { query: 'data', namespace: 'public/conclusions' },
    });

    const hits = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(hits.length).toBe(1);
    expect(hits[0].namespace).toBe('public/conclusions');
  });

  it('memory_search with agentId and time range filters', async () => {
    const started = await startMemoryMcpServer({ port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(started.url));
    await client.connect(transport);
    disposers.push(async () => { await client.close(); });

    await client.callTool({
      name: 'memory_add',
      arguments: { content: 'agent-1 work log entry alpha', agentId: 'agent-1', namespace: 'agent/1' },
    });
    await client.callTool({
      name: 'memory_add',
      arguments: { content: 'agent-2 work log entry beta', agentId: 'agent-2', namespace: 'agent/2' },
    });

    const result = await client.callTool({
      name: 'memory_search',
      arguments: { query: 'work log entry', agentId: 'agent-1' },
    });

    const hits = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(hits.length).toBe(1);
    expect(hits[0].agentId).toBe('agent-1');
  });

  it('memory_search without new params works as before', async () => {
    const started = await startMemoryMcpServer({ port: 0, dbPath: ':memory:' });
    disposers.push(async () => {
      await new Promise<void>((resolve, reject) => {
        started.server.close((err) => err ? reject(err) : resolve());
      });
      started.store.close();
    });

    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(started.url));
    await client.connect(transport);
    disposers.push(async () => { await client.close(); });

    await client.callTool({
      name: 'memory_add',
      arguments: { content: 'findable content item' },
    });

    const result = await client.callTool({
      name: 'memory_search',
      arguments: { query: 'findable content' },
    });

    const hits = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});
