#!/usr/bin/env tsx
import { spawn } from 'node:child_process';

interface AgentCard {
  agent_id: string;
  name: string;
  capabilities: string[];
  interests: string[];
  endpoint: string;
  status: 'online' | 'offline';
  registeredAt: string;
  lastSeenAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  requiredCapabilities: string[];
  status: 'pending' | 'claimed' | 'working' | 'done' | 'failed';
  assignee: string | null;
  createdBy: string;
  result: string | null;
  error: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  taskKind?: string;
  fromAgentId?: string;
  toAgentId?: string;
  parentTaskId?: string;
  runId?: string;
}

interface BoardSnapshot {
  agents: AgentCard[];
  tasks: Task[];
  timestamp: string;
}

const GATEWAY = process.env.GATEWAY ?? 'http://localhost:3000';
const AGENT_ID = process.env.HIVE_AGENT_ID ?? '';
const AGENT_NAME = process.env.HIVE_AGENT_NAME ?? AGENT_ID;
const ENDPOINT = process.env.HIVE_AGENT_ENDPOINT ?? 'http://localhost:9999';
const CAPABILITIES = (process.env.HIVE_CAPABILITIES ?? '').split(',').map(s => s.trim()).filter(Boolean);
const INTERESTS = (process.env.HIVE_INTERESTS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const POLL_MS = parseInt(process.env.HIVE_POLL_MS ?? '10000', 10);
const HEARTBEAT_MS = parseInt(process.env.HIVE_HEARTBEAT_MS ?? '15000', 10);
const WORKER_COMMAND = process.env.HIVE_WORKER_COMMAND ?? '';
const APPROVAL_AGENT_ID = process.env.HIVE_APPROVAL_AGENT_ID ?? 'claude-main';
const REQUIRE_APPROVAL = (process.env.HIVE_REQUIRE_APPROVAL ?? 'false').toLowerCase() === 'true';

if (!AGENT_ID || CAPABILITIES.length === 0 || !WORKER_COMMAND) {
  console.error('Missing required env vars: HIVE_AGENT_ID, HIVE_CAPABILITIES, HIVE_WORKER_COMMAND');
  process.exit(1);
}

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
    }),
  });
  console.log(`[bridge] registered ${AGENT_ID}`);
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

function renderPrompt(task: Task): string {
  return WORKER_COMMAND
    .replaceAll('{{TASK_ID}}', task.id)
    .replaceAll('{{TASK_TITLE}}', task.title)
    .replaceAll('{{TASK_DESCRIPTION}}', task.description)
    .replaceAll('{{TASK_JSON}}', JSON.stringify(task).replaceAll('"', '\\"'));
}

function buildTaskEnv(task: Task & { memoryContext?: string }): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HIVE_TASK_ID: task.id,
    HIVE_TASK_TITLE: task.title,
    HIVE_TASK_DESCRIPTION: task.description,
    HIVE_TASK_JSON: JSON.stringify(task),
    HIVE_MEMORY_CONTEXT: (task as any).memoryContext ?? '',
  };
}

async function runWorker(task: Task): Promise<{ ok: boolean; result?: string; error?: string }> {
  const decision = await requestApproval(task);
  if (decision !== 'approved') {
    return { ok: false, error: 'Rejected by approval agent' };
  }

  const command = renderPrompt(task);
  console.log(`[bridge] executing task ${task.id}: ${task.title}`);

  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildTaskEnv(task),
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, result: stdout.trim() || '(no stdout)' });
      } else {
        resolve({ ok: false, error: (stderr || stdout || `exit ${code}`).trim() });
      }
    });
  });
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
