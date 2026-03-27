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
}

export type HiveEventType =
  | 'task.assigned'
  | 'task.updated'
  | 'task.completed'
  | 'task.failed'
  | 'agent.online'
  | 'agent.offline';

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
