import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pino from 'pino';
import { FeishuAuth } from './feishu-auth.js';
import { RateLimiter, FEISHU_RATE_TIERS } from './rate-limiter.js';
import { FeishuClient } from './feishu-client.js';
import { registerReadBitable } from './tools/read-bitable.js';
import { registerReadDoc } from './tools/read-doc.js';
import { registerListBitables } from './tools/list-bitables.js';
import { registerWriteBitable } from './tools/write-bitable.js';

const logger = pino({ name: 'feishu-mcp' });

async function main(): Promise<void> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET environment variables are required');
  }

  const auth = new FeishuAuth({ appId, appSecret });
  const rateLimiter = new RateLimiter(FEISHU_RATE_TIERS.default);
  const client = new FeishuClient({ auth, rateLimiter });

  const server = new McpServer({ name: 'feishu-mcp', version: '0.1.0' });

  // Register tools
  registerReadBitable(server, client);
  registerReadDoc(server, client);
  registerListBitables(server, client);
  registerWriteBitable(server, client);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down feishu-mcp server...');
    rateLimiter.dispose();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('feishu-mcp server started on stdio transport');
}

main().catch((err) => {
  console.error('Failed to start feishu-mcp:', err);
  process.exit(1);
});
