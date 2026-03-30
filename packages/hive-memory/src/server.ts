import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod/v4';
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
    description: 'Persist a memory record with optional title metadata.',
    inputSchema: {
      title: z.string().max(1024).optional(),
      content: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
  }, async ({ title, content, metadata }) => {
    const record = store.add({ title, content, metadata });
    return {
      content: [{ type: 'text', text: JSON.stringify(record) }],
    };
  });

  server.registerTool('memory_search', {
    description: 'Search memory records by semantic similarity and title/path hints.',
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      n_results: z.number().int().min(1).max(100).optional(),
    },
  }, async ({ query, limit, n_results }) => {
    const resolvedLimit = limit ?? n_results ?? 10;
    const results = store.search(query, resolvedLimit);
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
