import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { FeishuClient } from '../feishu-client.js';

interface BatchCreateResponse {
  records: Array<{ record_id: string; fields: Record<string, unknown> }>;
}

interface BatchUpdateResponse {
  records: Array<{ record_id: string; fields: Record<string, unknown> }>;
}

export function registerWriteBitable(server: McpServer, client: FeishuClient): void {
  server.tool(
    'write_bitable',
    'Create, update, or delete records in a Feishu Bitable table',
    {
      app_token: z.string().describe('Bitable app token'),
      table_id: z.string().describe('Table ID'),
      records: z.array(
        z.object({ fields: z.record(z.string(), z.unknown()) }),
      ).min(1).max(50).describe('Records to create/update (max 50)'),
      action: z.enum(['create', 'update', 'delete']).default('create').describe('Operation type'),
      record_ids: z.array(z.string()).optional().describe('Record IDs (required for update/delete)'),
    },
    async (args) => {
      const basePath = `/bitable/v1/apps/${args.app_token}/tables/${args.table_id}/records`;

      if (args.action === 'create') {
        const data = await client.post(`${basePath}/batch_create`, {
          records: args.records,
        }) as BatchCreateResponse;

        const createdIds = (data.records ?? []).map((r) => r.record_id);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'create', count: createdIds.length, record_ids: createdIds }, null, 2),
          }],
        };
      }

      if (args.action === 'update') {
        if (!args.record_ids || args.record_ids.length !== args.records.length) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'record_ids must be provided and match records length for update action' }),
            }],
            isError: true,
          };
        }

        const updateRecords = args.records.map((r, i) => ({
          record_id: args.record_ids![i],
          fields: r.fields,
        }));

        const data = await client.post(`${basePath}/batch_update`, {
          records: updateRecords,
        }) as BatchUpdateResponse;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'update', count: (data.records ?? []).length }, null, 2),
          }],
        };
      }

      // delete
      if (!args.record_ids || args.record_ids.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'record_ids must be provided for delete action' }),
          }],
          isError: true,
        };
      }

      await client.post(`${basePath}/batch_delete`, {
        records: args.record_ids,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ action: 'delete', count: args.record_ids.length }, null, 2),
        }],
      };
    },
  );
}
