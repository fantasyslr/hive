import { spawn } from 'node:child_process';
import type { HarnessAdapter, HarnessCapabilities, ToolDefinition, TaskPayload, StructuredResult } from '../types.js';
import { extractStructuredResult } from '../extract-result.js';

export class GeminiAdapter implements HarnessAdapter {
  readonly name = 'gemini';
  readonly model = 'gemini-2.5-pro';
  readonly capabilities: HarnessCapabilities = {
    supportsStructuredOutput: true,
    supportsPersistentSession: false,
    supportsStreaming: true,
    maxContextTokens: 1_000_000,
  };
  readonly harnessTools: ToolDefinition[] = [
    { name: 'web.search', description: 'Search the web', isReadOnly: true, isConcurrencySafe: true },
  ];

  private childProcess: ReturnType<typeof spawn> | null = null;

  async execute(task: TaskPayload): Promise<StructuredResult> {
    const prompt = this.buildPrompt(task);
    const raw = await this.spawnCLI(prompt, task);
    return extractStructuredResult(raw);
  }

  async cancel(): Promise<void> {
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
    }
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

  private spawnCLI(prompt: string, task: TaskPayload): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('gemini', ['-p', '-'], {
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
          reject(new Error(`gemini CLI exited ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (err: Error) => {
        this.childProcess = null;
        reject(err);
      });
    });
  }
}
