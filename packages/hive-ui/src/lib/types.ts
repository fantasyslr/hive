/**
 * UI type definitions — mirrors @hive/shared types.
 * Copied here to avoid cross-package TS path resolution issues in Vite.
 * Source of truth: packages/shared/src/types.ts
 */

export interface AgentCard {
  agentId: string;
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
  outputRefs?: string[];
  fromAgentId?: string;
  toAgentId?: string;
  contextRef?: string;
  artifacts?: string[];
  taskKind?: TaskKind;
  parentTaskId?: string;
  runId?: string;
  verificationRequired?: boolean;
  retryCount?: number;
}

export interface BoardSnapshot {
  agents: RegisteredAgent[];
  tasks: Task[];
  timestamp: string;
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

export interface HiveEvent {
  id: number;
  type: HiveEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export const TASK_STATUSES: TaskStatus[] = ['pending', 'claimed', 'working', 'done', 'failed'];

export const TASK_KINDS: TaskKind[] = ['plan', 'execute', 'verify', 'fix', 'review', 'explore', 'custom'];
