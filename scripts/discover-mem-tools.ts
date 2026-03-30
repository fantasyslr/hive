/**
 * Standalone script: Connect to the configured memory MCP backend and print all available tool schemas.
 * Usage: npx tsx scripts/discover-mem-tools.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MEM_URL = process.env.HIVE_MEMORY_URL || process.env.NOWLEDGE_MEM_URL || 'http://localhost:14242/mcp';

async function main() {
  console.log(`Connecting to memory MCP at ${MEM_URL} ...`);

  const client = new Client({ name: 'hive-discover', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MEM_URL));

  try {
    await client.connect(transport);
    console.log('Connected.\n');

    const { tools } = await client.listTools();
    console.log(`Found ${tools.length} tool(s):\n`);

    for (const tool of tools) {
      console.log(`--- ${tool.name} ---`);
      console.log(`Description: ${tool.description ?? '(none)'}`);
      console.log('Input Schema:');
      console.log(JSON.stringify(tool.inputSchema, null, 2));
      console.log('');
    }

    await client.close();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to connect or list tools:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
