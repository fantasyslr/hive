import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { FeishuClient } from '../feishu-client.js';

interface TableInfo {
  table_id: string;
  name: string;
  revision: number;
}

interface ListTablesResponse {
  items: TableInfo[];
}

export function registerListBitables(server: McpServer, client: FeishuClient): void {
  server.tool(
    'list_bitables',
    'List all tables in a Feishu Bitable app',
    {
      app_token: z.string().describe('Bitable app token'),
    },
    async (args) => {
      const data = await client.get(
        `/bitable/v1/apps/${args.app_token}/tables`,
      ) as ListTablesResponse;

      const tables = (data.items ?? []).map((t) => ({
        table_id: t.table_id,
        name: t.name,
        revision: t.revision,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ tables }, null, 2),
        }],
      };
    },
  );
}
