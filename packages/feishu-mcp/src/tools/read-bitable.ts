import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { FeishuClient } from '../feishu-client.js';

interface BitableRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

interface BitableResponse {
  items: BitableRecord[];
  page_token?: string;
  has_more: boolean;
  total: number;
}

function normalizeFieldValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  // Array of objects with text field (e.g. text, link fields)
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const first = value[0] as Record<string, unknown>;
      // Multi-select: array of strings
      if ('text' in first && value.length > 1) {
        return value.map((v: Record<string, unknown>) => String(v.text ?? ''));
      }
      // Single text/link
      if ('text' in first) return String(first.text ?? '');
      if ('link' in first) return String(first.link ?? '');
    }
    return value;
  }

  // Checkbox
  if (typeof value === 'boolean') return value;

  // Number
  if (typeof value === 'number') return value;

  // Date (timestamp in ms)
  if (typeof value === 'object' && value !== null && 'date' in value) {
    return (value as { date: string }).date;
  }

  // Simple string
  if (typeof value === 'string') return value;

  return value;
}

export function registerReadBitable(server: McpServer, client: FeishuClient): void {
  server.tool(
    'read_bitable',
    'Read records from a Feishu Bitable table',
    {
      app_token: z.string().describe('Bitable app token'),
      table_id: z.string().describe('Table ID'),
      view_id: z.string().optional().describe('Specific view ID'),
      filter: z.string().optional().describe('Feishu filter expression'),
      page_size: z.number().optional().default(20).describe('Page size (max 500)'),
      page_token: z.string().optional().describe('Pagination token'),
    },
    async (args) => {
      const data = await client.get(
        `/bitable/v1/apps/${args.app_token}/tables/${args.table_id}/records`,
        {
          view_id: args.view_id,
          filter: args.filter,
          page_size: args.page_size,
          page_token: args.page_token,
        },
      ) as BitableResponse;

      const items = (data.items ?? []).map((item) => ({
        record_id: item.record_id,
        fields: Object.fromEntries(
          Object.entries(item.fields).map(([k, v]) => [k, normalizeFieldValue(v)]),
        ),
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            items,
            page_token: data.page_token,
            has_more: data.has_more,
            total: data.total,
          }, null, 2),
        }],
      };
    },
  );
}
