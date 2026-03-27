/**
 * Concurrent write stress test for Nowledge Mem.
 * Go/no-go gate for Phase 2 memory integration.
 *
 * Usage: npx tsx scripts/stress-test-mem.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// --- Configuration ---
const NUM_WRITERS = 3;
const WRITES_PER_WRITER = 50;
const MEM_URL = process.env.NOWLEDGE_MEM_URL || 'http://localhost:14242/mcp';

// Tool names — update these if discover-mem-tools.ts reveals different names
const WRITE_TOOL = process.env.MEM_WRITE_TOOL || 'add_memories';
const SEARCH_TOOL = process.env.MEM_SEARCH_TOOL || 'search_memory';

interface WriterResult {
  id: number;
  written: number;
  errors: Array<{ seq: number; message: string }>;
  elapsed: number;
}

async function createWriter(id: number): Promise<WriterResult> {
  const client = new Client({ name: `stress-writer-${id}`, version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MEM_URL));
  const errors: Array<{ seq: number; message: string }> = [];
  let written = 0;

  const start = Date.now();

  try {
    await client.connect(transport);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Writer ${id}: connection failed — ${msg}`);
    return { id, written: 0, errors: [{ seq: -1, message: msg }], elapsed: Date.now() - start };
  }

  for (let i = 0; i < WRITES_PER_WRITER; i++) {
    try {
      await client.callTool({
        name: WRITE_TOOL,
        arguments: {
          content: `stress-test writer=${id} seq=${i} ts=${Date.now()}`,
        },
      });
      written++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ seq: i, message: msg });
    }
  }

  try {
    await client.close();
  } catch {
    // Ignore close errors
  }

  return { id, written, errors, elapsed: Date.now() - start };
}

async function main() {
  console.log('=== Nowledge Mem Concurrent Write Stress Test ===');
  console.log(`URL:     ${MEM_URL}`);
  console.log(`Writers: ${NUM_WRITERS}`);
  console.log(`Writes:  ${WRITES_PER_WRITER} per writer`);
  console.log(`Total:   ${NUM_WRITERS * WRITES_PER_WRITER} expected writes`);
  console.log(`Write tool: ${WRITE_TOOL}`);
  console.log(`Search tool: ${SEARCH_TOOL}`);
  console.log('');

  const start = Date.now();

  // Launch all writers concurrently
  const results = await Promise.all(
    Array.from({ length: NUM_WRITERS }, (_, i) => createWriter(i)),
  );

  const totalWritten = results.reduce((sum, r) => sum + r.written, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const elapsed = Date.now() - start;

  console.log('--- Writer Results ---');
  for (const r of results) {
    console.log(
      `Writer ${r.id}: ${r.written}/${WRITES_PER_WRITER} written, ${r.errors.length} errors, ${r.elapsed}ms`,
    );
    if (r.errors.length > 0) {
      for (const e of r.errors.slice(0, 5)) {
        console.log(`  err seq=${e.seq}: ${e.message}`);
      }
      if (r.errors.length > 5) {
        console.log(`  ... and ${r.errors.length - 5} more`);
      }
    }
  }

  console.log('');
  console.log('--- Verification ---');

  // Verify by searching for stress-test entries
  try {
    const verifyClient = new Client({ name: 'stress-verify', version: '0.1.0' });
    const verifyTransport = new StreamableHTTPClientTransport(new URL(MEM_URL));
    await verifyClient.connect(verifyTransport);

    const searchResult = await verifyClient.callTool({
      name: SEARCH_TOOL,
      arguments: { query: 'stress-test', n_results: NUM_WRITERS * WRITES_PER_WRITER },
    });
    console.log(`Search for "stress-test" returned content.`);
    if (Array.isArray(searchResult.content)) {
      console.log(`Search result entries: ${searchResult.content.length}`);
    }

    await verifyClient.close();
  } catch (err) {
    console.log(`Verification search failed: ${err instanceof Error ? err.message : err}`);
  }

  console.log('');
  console.log('--- Summary ---');
  console.log(`Total written: ${totalWritten}/${NUM_WRITERS * WRITES_PER_WRITER}`);
  console.log(`Total errors:  ${totalErrors}`);
  console.log(`Elapsed:       ${elapsed}ms`);
  console.log('');

  if (totalErrors === 0) {
    console.log('=== RESULT: PASS ===');
    process.exit(0);
  } else {
    console.log('=== RESULT: FAIL ===');
    process.exit(1);
  }
}

main();
