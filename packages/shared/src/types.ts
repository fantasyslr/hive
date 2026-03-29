export interface AgentCard {
  agent_id: string;
  name: string;
  capabilities: string[];
  interests: string[];
  endpoint: string;
}

export interface RegisteredAgent extends AgentCard {
  status: 'online' | 'offline';
  registeredAt: string;
  lastSeenAt: string;
}

export type TaskStatus = 'pending' | 'claimed' | 'working' | 'done' | 'failed';

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
  output_refs?: string[]; // e.g., ["mem://public/conclusions/task-xxx"]
  // Collaboration metadata (optional, backward-compatible)
  from_agent_id?: string;    // who created/requested this task
  to_agent_id?: string;      // intended assignee (hint, not enforced)
  context_ref?: string;      // mem:// reference for task context
  artifacts?: string[];      // file paths or references attached to this task
}

export interface MemoryConclusion {
  task_id: string;
  agent_id: string;
  conclusion: string;
  decision_reason: string;
  impact_scope: string;
  timestamp: string;
  namespace: string; // "public/conclusions/{task_id}"
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
  event_type: string;      // e.g., "bitable.record.changed"
  app_token?: string;
  table_id?: string;
  document_id?: string;
  action?: string;         // "record_added", "record_updated", etc.
  operator_id?: string;
  timestamp: string;
}

export interface HiveEvent {
  id: number;
  type: HiveEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RoutingScore {
  agent_id: string;
  interest: number;    // 0 or 50
  capability: number;  // 0 or 20
  load: number;        // 0-30
  starvation: number;  // 0 or STARVATION_BOOST
  total: number;       // sum
}

export type DispatchStrategy = 'interest-first' | 'capability-only';

export interface P2PRequest {
  from_agent_id: string;
  payload: Record<string, unknown>;
  timeout_ms?: number; // max wait for target agent response; default 30_000
}

export interface P2PResponse {
  from_agent_id: string;
  to_agent_id: string;
  status: 'delivered' | 'error';
  response?: unknown;
  error?: string;
  latency_ms: number;
}

export interface BoardSnapshot {
  agents: RegisteredAgent[];
  tasks: Task[];
  timestamp: string;
}
