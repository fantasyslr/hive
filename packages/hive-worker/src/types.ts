import type { Task, TaskKind } from '@hive/shared';

/** Per D-02: Harness capability profile */
export interface HarnessCapabilities {
  supportsStructuredOutput: boolean;
  supportsPersistentSession: boolean;
  supportsStreaming: boolean;
  maxContextTokens: number;
}

/** Per D-08: Structured result from task completion */
export interface StructuredResult {
  conclusion: string;
  decisionReason: string;
  keyFindings: string[];
  artifacts: string[];
  raw: string;
}

/** Per D-04/D-05: Self-describing tool definition */
export interface ToolDefinition {
  name: string;
  description: string;
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  parameters?: Record<string, unknown>;
}

/** Two-layer tool categories per D-04 */
export type ToolCategory = 'hive' | 'harness';

/** Per D-05: Tool with category metadata */
export interface RegisteredTool extends ToolDefinition {
  category: ToolCategory;
  registeredBy?: string; // agentId for harness tools
}

/** Task payload sent to adapter — extends Task with memory context */
export interface TaskPayload extends Task {
  memoryContext?: string;
}

/** Per D-01: Medium-thickness adapter interface */
export interface HarnessAdapter {
  readonly name: string;
  readonly model: string;
  readonly capabilities: HarnessCapabilities;
  /** Tools this harness natively supports (per D-06) */
  readonly harnessTools: ToolDefinition[];
  /** Execute a task and return structured result */
  execute(task: TaskPayload): Promise<StructuredResult>;
  /** Optional cancellation (best-effort) */
  cancel?(): Promise<void>;
}
