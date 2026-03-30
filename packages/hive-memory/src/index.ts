import { join } from 'node:path';
import { startMemoryMcpServer } from './server.js';

const host = process.env.HIVE_MEMORY_HOST || '::';
const port = Number(process.env.HIVE_MEMORY_PORT || '14242');
const dbPath = process.env.HIVE_MEMORY_DB_PATH || join(process.cwd(), '.data', 'hive-memory.db');
const allowedHosts = (process.env.HIVE_MEMORY_ALLOWED_HOSTS || 'localhost,127.0.0.1')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

async function main() {
  const { server, store, url } = await startMemoryMcpServer({ host, port, dbPath, allowedHosts });
  console.log(`Hive Memory MCP listening on ${url}`);

  const shutdown = () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start Hive Memory MCP:', error);
  process.exit(1);
});
