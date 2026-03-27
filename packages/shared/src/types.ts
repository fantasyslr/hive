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
  | 'memory.updated';

export interface HiveEvent {
  id: number;
  type: HiveEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface BoardSnapshot {
  agents: RegisteredAgent[];
  tasks: Task[];
  timestamp: string;
}
