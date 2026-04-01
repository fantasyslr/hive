export interface AgentCard {
  agentId: string;
  name: string;
  capabilities: string[];
  interests: string[];
  endpoint: string;
  // Phase 4: Worker runtime extensions (optional, backward-compatible)
  harnessCapabilities?: {
    supportsStructuredOutput: boolean;
    supportsPersistentSession: boolean;
    supportsStreaming: boolean;
    maxContextTokens: number;
  };
  harnessTools?: Array<{
    name: string;
    description: string;
    isReadOnly: boolean;
    isConcurrencySafe: boolean;
  }>;
}

export interface RegisteredAgent extends AgentCard {
  status: 'online' | 'offline';
  registeredAt: string;
  lastSeenAt: string;
}

export type TaskStatus = 'pending' | 'claimed' | 'working' | 'done' | 'failed';

export type TaskKind = 'plan' | 'execute' | 'verify' | 'fix' | 'review' | 'explore' | 'custom';

export interface Task {
  id: string;
  title: string;
  description: string;
  requiredCapabilities: string[];
  status: TaskStatus;
  assignee: string | null;
  createdBy: string;
  result: string | null;
  error: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  outputRefs?: string[];      // e.g., ["mem://public/conclusions/task-xxx"]
  // Collaboration metadata (optional, backward-compatible)
  fromAgentId?: string;      // who created/requested this task
  toAgentId?: string;        // intended assignee (hint, not enforced)
  contextRef?: string;        // mem:// reference for task context
  artifacts?: string[];        // file paths or references attached to this task
  // Orchestration metadata (OMC-inspired, optional)
  taskKind?: TaskKind;        // intent: plan, execute, verify, fix, review, explore
  parentTaskId?: string;     // links to parent task for sub-task chains
  runId?: string;             // groups tasks in the same workflow run
  verificationRequired?: boolean; // when true, completion triggers a verifier sub-task
  retryCount?: number;        // incremented on each retry, defaults to 0
  dependsOn?: string[];       // task IDs that must be "done" before this task can be claimed
}

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  namespace: string;
  agentId?: string;
  taskId?: string;
  expiresAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHit extends MemoryRecord {
  score: number;
}

export interface SearchFilter {
  namespace?: string;
  agentId?: string;
  after?: string;
  before?: string;
}

export interface MemoryConclusion {
  taskId: string;
  agentId: string;
  conclusion: string;
  decisionReason: string;
  impactScope: string;
  timestamp: string;
  namespace: string; // "public/conclusions/{taskId}"
}

export type HiveEventType =
  | 'task.assigned'
  | 'task.updated'
  | 'task.completed'
  | 'task.failed'
  | 'agent.online'
  | 'agent.offline'
  | 'memory.updated'
  | 'feishu.changed';

export interface FeishuChangeEvent {
  eventType: string;      // e.g., "bitable.record.changed"
  appToken?: string;
  tableId?: string;
  documentId?: string;
  action?: string;         // "record_added", "record_updated", etc.
  operatorId?: string;
  timestamp: string;
}

export interface HiveEvent {
  id: number;
  type: HiveEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RoutingScore {
  agentId: string;
  interest: number;    // 0 or 50
  capability: number;  // 0 or 20
  load: number;        // 0-30
  starvation: number;  // 0 or STARVATION_BOOST
  total: number;       // sum
}

export type DispatchStrategy = 'interest-first' | 'capability-only';

export interface P2PRequest {
  fromAgentId: string;
  payload: Record<string, unknown>;
  timeoutMs?: number; // max wait for target agent response; default 30_000
}

export interface P2PResponse {
  fromAgentId: string;
  toAgentId: string;
  status: 'delivered' | 'error';
  response?: unknown;
  error?: string;
  latencyMs: number;
}

export interface CampaignTemplateTask {
  title: string;
  role: string;
  capabilities: string[];
  dependsOn: string[];   // titles of predecessor tasks
  description?: string;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  description?: string;
  tasks: CampaignTemplateTask[];
}

export interface BoardSnapshot {
  agents: RegisteredAgent[];
  tasks: Task[];
  timestamp: string;
}
