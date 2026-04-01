#!/usr/bin/env tsx
import { ClaudeAdapter, GeminiAdapter, CodexAdapter } from '@hive/worker';
import type { HarnessAdapter, TaskPayload, StructuredResult } from '@hive/worker';
import type { Task, BoardSnapshot } from '@hive/shared';

const GATEWAY = process.env.GATEWAY ?? 'http://localhost:3000';
const AGENT_ID = process.env.HIVE_AGENT_ID ?? '';
const AGENT_NAME = process.env.HIVE_AGENT_NAME ?? AGENT_ID;
const ENDPOINT = process.env.HIVE_AGENT_ENDPOINT ?? 'http://localhost:9999';
const CAPABILITIES = (process.env.HIVE_CAPABILITIES ?? '').split(',').map(s => s.trim()).filter(Boolean);
const INTERESTS = (process.env.HIVE_INTERESTS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const POLL_MS = parseInt(process.env.HIVE_POLL_MS ?? '10000', 10);
const HEARTBEAT_MS = parseInt(process.env.HIVE_HEARTBEAT_MS ?? '15000', 10);
const HIVE_HARNESS = process.env.HIVE_HARNESS ?? 'claude';
const APPROVAL_AGENT_ID = process.env.HIVE_APPROVAL_AGENT_ID ?? 'claude-main';
const REQUIRE_APPROVAL = (process.env.HIVE_REQUIRE_APPROVAL ?? 'false').toLowerCase() === 'true';

if (!AGENT_ID || CAPABILITIES.length === 0) {
  console.error('Missing required env vars: HIVE_AGENT_ID, HIVE_CAPABILITIES');
  process.exit(1);
}

function createAdapter(harness: string): HarnessAdapter {
  switch (harness) {
    case 'claude': return new ClaudeAdapter();
    case 'gemini': return new GeminiAdapter();
    case 'codex': return new CodexAdapter();
    default: throw new Error(`Unknown harness: ${harness}`);
  }
}

const adapter = createAdapter(HIVE_HARNESS);

let stopping = false;
let isProcessing = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TOKEN = process.env.HIVE_TOKEN ?? 'hive-token-manager';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function register(): Promise<void> {
  await http('/agents', {
    method: 'POST',
    body: JSON.stringify({
      agentId: AGENT_ID,
      name: AGENT_NAME,
      capabilities: CAPABILITIES,
      interests: INTERESTS,
      endpoint: ENDPOINT,
      harnessCapabilities: adapter.capabilities,
      harnessTools: adapter.harnessTools,
    }),
  });
  console.log(`[bridge] registered ${AGENT_ID} (harness: ${adapter.name})`);
}

async function heartbeatLoop(): Promise<void> {
  while (!stopping) {
    try {
      await http(`/heartbeat/${AGENT_ID}`, { method: 'POST' });
    } catch (err) {
      console.error('[bridge] heartbeat failed', err);
    }
    await sleep(HEARTBEAT_MS);
  }
}

async function getBoard(): Promise<BoardSnapshot> {
  return http<BoardSnapshot>('/board');
}

async function getTask(taskId: string): Promise<Task> {
  return http<Task>(`/tasks/${taskId}`);
}

async function patchTask(taskId: string, payload: Record<string, unknown>): Promise<Task> {
  return http<Task>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function requestApproval(task: Task): Promise<'approved' | 'rejected'> {
  if (!REQUIRE_APPROVAL) return 'approved';
  try {
    const response = await http<{ status: string; response?: any }>(`/agents/${APPROVAL_AGENT_ID}/request`, {
      method: 'POST',
      body: JSON.stringify({
        from_agentId: AGENT_ID,
        payload: {
          action: 'approval_request',
          task,
          requested_by: AGENT_ID,
        },
        timeout_ms: 30000,
      }),
    });
    const decision = response.response?.decision;
    return decision === 'approved' ? 'approved' : 'rejected';
  } catch (err) {
    console.warn('[bridge] approval request failed, treating as rejected', err);
    return 'rejected';
  }
}

async function runWorker(task: Task & { memoryContext?: string }): Promise<{ ok: boolean; result?: string; error?: string }> {
  const decision = await requestApproval(task);
  if (decision !== 'approved') {
    return { ok: false, error: 'Rejected by approval agent' };
  }

  console.log(`[bridge] executing task ${task.id}: ${task.title} (adapter: ${adapter.name})`);

  try {
    const payload: TaskPayload = {
      ...task,
      memoryContext: (task as any).memoryContext ?? undefined,
    };

    // Start or resume persistent session if task has a runId (Phase 6 CORD-04)
    if (payload.runId && adapter.startSession) {
      try {
        await adapter.startSession(payload.runId);
      } catch (err) {
        console.warn(`[bridge] session start failed for runId=${payload.runId}, falling back to one-shot`, err);
      }
    }

    const structuredResult: StructuredResult = await adapter.execute(payload);
    return { ok: true, result: JSON.stringify(structuredResult) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function processClaimedTask(task: Task): Promise<void> {
  isProcessing = true;
  try {
    const fresh = await getTask(task.id);
    if (fresh.assignee !== AGENT_ID || fresh.status !== 'claimed') return;

    const working = await patchTask(task.id, {
      agentId: AGENT_ID,
      version: fresh.version,
      status: 'working',
    });

    // Fetch relevant memory context before running worker
    let memoryContext = '';
    try {
      const hits = await http<any[]>(`/memory/search?query=${encodeURIComponent(task.title)}&limit=3`);
      if (Array.isArray(hits) && hits.length > 0) {
        memoryContext = hits.map((h: any) => `- ${h.title ?? h.namespace}: ${h.content}`).join('\n');
      }
    } catch { /* memory unavailable, proceed without */ }

    const outcome = await runWorker({ ...working, memoryContext } as any);
    const latest = await getTask(task.id);
    if (latest.assignee !== AGENT_ID || latest.status !== 'working') return;

    if (outcome.ok) {
      await patchTask(task.id, {
        agentId: AGENT_ID,
        version: latest.version,
        status: 'done',
        result: outcome.result,
      });
      console.log(`[bridge] task done ${task.id}`);
    } else {
      await patchTask(task.id, {
        agentId: AGENT_ID,
        version: latest.version,
        status: 'failed',
        error: outcome.error,
      });
      console.log(`[bridge] task failed ${task.id}`);
    }
  } catch (err) {
    console.error('[bridge] process task error', err);
  } finally {
    isProcessing = false;
  }
}

async function taskLoop(): Promise<void> {
  while (!stopping) {
    try {
      if (!isProcessing) {
        const board = await getBoard();
        const next = board.tasks.find(t => t.assignee === AGENT_ID && t.status === 'claimed');
        if (next) {
          await processClaimedTask(next);
          continue;
        }
      }
    } catch (err) {
      console.error('[bridge] poll failed', err);
    }
    await sleep(POLL_MS);
  }
}

async function main(): Promise<void> {
  await register();
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  await Promise.all([heartbeatLoop(), taskLoop()]);
}

main().catch((err) => {
  console.error('[bridge] fatal', err);
  process.exit(1);
});
