import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { FeishuClient } from '../feishu-client.js';

interface DocRawContent {
  content: string;
  revision: number;
}

interface DocMeta {
  document: {
    document_id: string;
    title: string;
    revision_id: number;
  };
}

export function registerReadDoc(server: McpServer, client: FeishuClient): void {
  server.tool(
    'read_doc',
    'Read content from a Feishu document',
    {
      document_id: z.string().describe('Document ID'),
      format: z.enum(['markdown', 'text']).optional().default('markdown').describe('Output format'),
    },
    async (args) => {
      // Get document metadata for title
      const meta = await client.get(
        `/docx/v1/documents/${args.document_id}`,
      ) as DocMeta;

      // Get raw content
      const rawContent = await client.get(
        `/docx/v1/documents/${args.document_id}/raw_content`,
      ) as DocRawContent;

      const content = rawContent.content ?? '';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            title: meta.document.title,
            content: content,
            revision: meta.document.revision_id,
          }, null, 2),
        }],
      };
    },
  );
}
