/**
 * UI type definitions — mirrors @hive/shared types.
 * Copied here to avoid cross-package TS path resolution issues in Vite.
 * Source of truth: packages/shared/src/types.ts
 */

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
  output_refs?: string[];
  from_agent_id?: string;
  to_agent_id?: string;
  context_ref?: string;
  artifacts?: string[];
  task_kind?: TaskKind;
  parent_task_id?: string;
  run_id?: string;
  verification_required?: boolean;
  retry_count?: number;
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
