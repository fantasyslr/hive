import { spawn, type ChildProcess } from 'node:child_process';
import type { HarnessAdapter, HarnessCapabilities, ToolDefinition, TaskPayload, StructuredResult } from '../types.js';
import { extractStructuredResult } from '../extract-result.js';
import { SessionManager } from '../session-manager.js';

export class ClaudeAdapter implements HarnessAdapter {
  readonly name = 'claude';
  readonly model = 'claude-sonnet';
  readonly capabilities: HarnessCapabilities = {
    supportsStructuredOutput: true,
    supportsPersistentSession: true,
    supportsStreaming: true,
    maxContextTokens: 200_000,
  };
  readonly harnessTools: ToolDefinition[] = [
    { name: 'file.read', description: 'Read file contents', isReadOnly: true, isConcurrencySafe: true },
    { name: 'file.write', description: 'Write file contents', isReadOnly: false, isConcurrencySafe: false },
    { name: 'bash', description: 'Execute shell commands', isReadOnly: false, isConcurrencySafe: false },
    { name: 'web.search', description: 'Search the web', isReadOnly: true, isConcurrencySafe: true },
  ];

  private childProcess: ChildProcess | null = null;
  private sessionManager = new SessionManager();
  private activeSessions = new Map<string, ChildProcess>();

  async execute(task: TaskPayload): Promise<StructuredResult> {
    const prompt = this.buildPrompt(task);

    // If task has runId and an active session exists, use persistent mode
    if (task.runId && this.sessionManager.isActive(task.runId)) {
      try {
        const raw = await this.writeToSession(task.runId, prompt);
        this.sessionManager.touch(task.runId);
        return extractStructuredResult(raw);
      } catch (err) {
        // Fallback to one-shot on persistent session failure (D-10)
        console.warn(`[ClaudeAdapter] Persistent session failed for run ${task.runId}, falling back to one-shot:`, err);
        this.sessionManager.unregister(task.runId);
        this.activeSessions.delete(task.runId);
      }
    }

    // One-shot mode (default)
    const raw = await this.spawnCLI(prompt, task);
    return extractStructuredResult(raw);
  }

  async cancel(): Promise<void> {
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
    }
  }

  /** Start a persistent session for a runId — keeps claude CLI process alive */
  async startSession(runId: string): Promise<void> {
    if (this.activeSessions.has(runId)) return;

    const child = spawn('claude', ['--conversation'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.on('error', (err) => {
      console.warn(`[ClaudeAdapter] Session process error for run ${runId}:`, err);
      this.sessionManager.unregister(runId);
      this.activeSessions.delete(runId);
    });

    child.on('close', () => {
      this.sessionManager.unregister(runId);
      this.activeSessions.delete(runId);
    });

    this.activeSessions.set(runId, child);
    this.sessionManager.register(runId, child.pid!);
  }

  /** Resume a session — start if not active (graceful fallback per D-10) */
  async resumeSession(runId: string): Promise<void> {
    if (this.sessionManager.isActive(runId)) {
      this.sessionManager.touch(runId);
      return;
    }
    console.warn(`[ClaudeAdapter] Session for run ${runId} not active, starting new session (fallback)`);
    await this.startSession(runId);
  }

  /** End a persistent session — kill process and clean up */
  async endSession(runId: string): Promise<void> {
    const child = this.activeSessions.get(runId);
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    this.activeSessions.delete(runId);
    this.sessionManager.unregister(runId);
  }

  private buildPrompt(task: TaskPayload): string {
    const parts = [
      `You are a Hive AI worker.`,
      `Task: ${task.title}`,
      `Description: ${task.description}`,
    ];
    if (task.memoryContext) {
      parts.push(`\nRelevant history from team memory:\n${task.memoryContext}`);
    }
    parts.push(`\nComplete this task. Return your result as JSON: {"conclusion":"...","decisionReason":"...","keyFindings":[...],"artifacts":[...]}`);
    return parts.join('\n');
  }

  /** Write prompt to an existing persistent session and collect response */
  private writeToSession(runId: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.activeSessions.get(runId);
      if (!child || child.killed) {
        reject(new Error(`No active session for run ${runId}`));
        return;
      }

      let stdout = '';
      const onData = (chunk: Buffer) => { stdout += chunk.toString(); };
      child.stdout!.on('data', onData);

      // Use a delimiter to detect end of response
      const delimiter = `__HIVE_END_${Date.now()}__`;
      child.stdin!.write(`${prompt}\n\nWhen done, output exactly: ${delimiter}\n`);

      const timeout = setTimeout(() => {
        child.stdout!.removeListener('data', onData);
        // Return what we have even on timeout
        resolve(stdout.trim());
      }, 120_000);

      const checkComplete = () => {
        if (stdout.includes(delimiter)) {
          clearTimeout(timeout);
          child.stdout!.removeListener('data', onData);
          resolve(stdout.replace(delimiter, '').trim());
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }

  /** One-shot spawn — original behavior */
  private spawnCLI(prompt: string, task: TaskPayload): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['-p', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HIVE_TASK_ID: task.id,
          HIVE_TASK_JSON: JSON.stringify(task),
        },
      });
      this.childProcess = child;

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.stdin.write(prompt);
      child.stdin.end();

      child.on('close', (code: number | null) => {
        this.childProcess = null;
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`claude CLI exited ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (err: Error) => {
        this.childProcess = null;
        reject(err);
      });
    });
  }
}
