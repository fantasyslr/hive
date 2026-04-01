import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAdapter } from './claude-adapter.js';
import type { TaskPayload } from '../types.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

function createMockChild(stdout: string, stderr: string, exitCode: number) {
  const stdoutHandlers: Record<string, Function> = {};
  const stderrHandlers: Record<string, Function> = {};
  const childHandlers: Record<string, Function> = {};

  const child = {
    stdout: { on: vi.fn((event: string, cb: Function) => { stdoutHandlers[event] = cb; }) },
    stderr: { on: vi.fn((event: string, cb: Function) => { stderrHandlers[event] = cb; }) },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn((event: string, cb: Function) => { childHandlers[event] = cb; }),
    kill: vi.fn(),
    killed: false,
  };

  // Simulate async behavior
  setTimeout(() => {
    if (stdout) stdoutHandlers['data']?.(Buffer.from(stdout));
    if (stderr) stderrHandlers['data']?.(Buffer.from(stderr));
    childHandlers['close']?.(exitCode);
  }, 0);

  return child;
}

const baseTask: TaskPayload = {
  id: 'task-123',
  title: 'Test task',
  description: 'A test task description',
  kind: 'research',
  status: 'working',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    adapter = new ClaudeAdapter();
    vi.clearAllMocks();
  });

  it('has correct name, model, and capabilities', () => {
    expect(adapter.name).toBe('claude');
    expect(adapter.model).toBe('claude-sonnet');
    expect(adapter.capabilities.supportsStructuredOutput).toBe(true);
    expect(adapter.capabilities.supportsPersistentSession).toBe(true);
    expect(adapter.capabilities.supportsStreaming).toBe(true);
    expect(adapter.capabilities.maxContextTokens).toBe(200_000);
  });

  it('declares harnessTools with file.read, bash, and web.search', () => {
    const toolNames = adapter.harnessTools.map(t => t.name);
    expect(toolNames).toContain('file.read');
    expect(toolNames).toContain('file.write');
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('web.search');
  });

  it('spawns claude CLI with correct args and env vars', async () => {
    const jsonResult = JSON.stringify({
      conclusion: 'Done',
      decisionReason: 'Simple',
      keyFindings: [],
      artifacts: [],
    });
    const child = createMockChild(jsonResult, '', 0);
    mockSpawn.mockReturnValue(child as any);

    const result = await adapter.execute(baseTask);

    expect(mockSpawn).toHaveBeenCalledWith('claude', ['-p', '-'], expect.objectContaining({
      stdio: ['pipe', 'pipe', 'pipe'],
      env: expect.objectContaining({
        HIVE_TASK_ID: 'task-123',
      }),
    }));
    expect(result.conclusion).toBe('Done');
  });

  it('parses stdout JSON via extractStructuredResult', async () => {
    const jsonResult = JSON.stringify({
      conclusion: 'Task completed',
      decisionReason: 'Approach B',
      keyFindings: ['f1'],
      artifacts: ['a.ts'],
    });
    const child = createMockChild(jsonResult, '', 0);
    mockSpawn.mockReturnValue(child as any);

    const result = await adapter.execute(baseTask);

    expect(result.conclusion).toBe('Task completed');
    expect(result.decisionReason).toBe('Approach B');
    expect(result.keyFindings).toEqual(['f1']);
    expect(result.artifacts).toEqual(['a.ts']);
  });

  it('rejects with error when CLI exits non-zero', async () => {
    const child = createMockChild('', 'something went wrong', 1);
    mockSpawn.mockReturnValue(child as any);

    await expect(adapter.execute(baseTask)).rejects.toThrow('claude CLI exited 1: something went wrong');
  });

  it('cancel() sends SIGTERM to child process', async () => {
    // Create a child that never closes (hangs)
    const child = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      killed: false,
    };
    mockSpawn.mockReturnValue(child as any);

    // Start execute but don't await (it will hang)
    const promise = adapter.execute(baseTask);

    // Cancel should send SIGTERM
    await adapter.cancel();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    // Clean up: simulate close to resolve the hanging promise
    const closeHandler = child.on.mock.calls.find((c: any[]) => c[0] === 'close');
    if (closeHandler) closeHandler[1](1);
    await promise.catch(() => {}); // ignore rejection
  });
});
