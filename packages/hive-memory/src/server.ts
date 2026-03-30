import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod/v4';
import type { SearchFilter } from '@hive/shared';
import { MemoryStore } from './store.js';

export interface MemoryServerOptions {
  host?: string;
  port?: number;
  dbPath?: string;
  allowedHosts?: string[];
}

export function createMemoryMcpServer(store: MemoryStore): McpServer {
  const server = new McpServer({
    name: 'hive-memory-mcp',
    version: '0.1.0',
  });

  server.registerTool('memory_add', {
    description: 'Persist a memory record with optional namespace, source tracking, and TTL.',
    inputSchema: {
      title: z.string().max(1024).optional(),
      content: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
      namespace: z.string().max(256).optional(),
      agentId: z.string().max(128).optional(),
      taskId: z.string().uuid().optional(),
      ttlMs: z.number().int().min(1000).optional(),
    },
  }, async ({ title, content, metadata, namespace, agentId, taskId, ttlMs }) => {
    const record = store.add({ title, content, metadata, namespace, agentId, taskId, ttlMs });
    return {
      content: [{ type: 'text', text: JSON.stringify(record) }],
    };
  });

  server.registerTool('memory_search', {
    description: 'Search memory records by semantic similarity with optional namespace, agent, and time range filters.',
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      n_results: z.number().int().min(1).max(100).optional(),
      namespace: z.string().max(256).optional(),
      agentId: z.string().max(128).optional(),
      after: z.string().datetime().optional(),
      before: z.string().datetime().optional(),
    },
  }, async ({ query, limit, n_results, namespace, agentId, after, before }) => {
    const resolvedLimit = limit ?? n_results ?? 10;
    const filter: SearchFilter = {};
    if (namespace !== undefined) filter.namespace = namespace;
    if (agentId !== undefined) filter.agentId = agentId;
    if (after !== undefined) filter.after = after;
    if (before !== undefined) filter.before = before;
    const hasFilter = Object.keys(filter).length > 0;
    const results = store.search(query, resolvedLimit, hasFilter ? filter : undefined);
    return {
      content: [{ type: 'text', text: JSON.stringify(results) }],
    };
  });

  server.registerTool('memory_update', {
    description: 'Update an existing memory record by id.',
    inputSchema: {
      id: z.string().uuid(),
      title: z.string().max(1024).optional(),
      content: z.string().min(1).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
  }, async ({ id, title, content, metadata }) => {
    const record = store.update({ id, title, content, metadata });
    return {
      content: [{ type: 'text', text: JSON.stringify(record) }],
    };
  });

  return server;
}

export function createMemoryMcpApp(store: MemoryStore, host = '::', allowedHosts?: string[]) {
  const app = createMcpExpressApp({ host, allowedHosts });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/mcp', async (req, res) => {
    const server = createMemoryMcpServer(store);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }));
  });

  app.delete('/mcp', (_req, res) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    }));
  });

  return app;
}

export async function startMemoryMcpServer(options: MemoryServerOptions = {}): Promise<{
  app: ReturnType<typeof createMemoryMcpApp>;
  server: HttpServer;
  store: MemoryStore;
  url: string;
}> {
  const host = options.host ?? '::';
  const port = options.port ?? 14242;
  const dbPath = options.dbPath ?? join(process.cwd(), '.data', 'hive-memory.db');
  const allowedHosts = options.allowedHosts ?? ['localhost', '127.0.0.1'];
  const store = new MemoryStore(dbPath);
  const app = createMemoryMcpApp(store, host, allowedHosts);
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;

  return {
    app,
    server,
    store,
    url: `http://localhost:${resolvedPort}/mcp`,
  };
}
