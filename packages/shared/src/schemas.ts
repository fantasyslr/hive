import { z } from 'zod/v4';

export const AgentRegistrationSchema = z.object({
  agent_id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  capabilities: z.array(z.string().min(1)).min(1),
  interests: z.array(z.string()).default([]),
  endpoint: z.string().url(),
});

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(4096).default(''),
  requiredCapabilities: z.array(z.string().min(1)).min(1),
  createdBy: z.string().min(1),
  // Collaboration metadata (optional, backward-compatible)
  from_agent_id: z.string().min(1).max(64).optional(),
  to_agent_id: z.string().min(1).max(64).optional(),
  context_ref: z.string().max(1024).optional(),
  artifacts: z.array(z.string()).optional(),
  // Orchestration metadata (OMC-inspired, optional)
  task_kind: z.string().min(1).max(32).optional(),
  parent_task_id: z.string().min(1).max(64).optional(),
  run_id: z.string().min(1).max(64).optional(),
  verification_required: z.boolean().optional(),
});

export const ClaimTaskSchema = z.object({
  agent_id: z.string().min(1),
  version: z.number().int().nonnegative(),
});

export const UpdateTaskSchema = z.object({
  agent_id: z.string().min(1),
  version: z.number().int().nonnegative(),
  status: z.enum(['working', 'done', 'failed']),
  result: z.string().nullish(),
  error: z.string().nullish(),
  output_refs: z.array(z.string()).optional(),
});

export const MemorySearchSchema = z.object({
  query: z.string().min(1).max(1024),
  namespace: z.enum(['public', 'agent']).default('public'),
  limit: z.number().int().min(1).max(50).default(10),
});

export const RetryTaskSchema = z.object({
  version: z.number().int().nonnegative(),
});

export const PublishEventSchema = z.object({
  agent_id: z.string().min(1).max(64),
  type: z.enum([
    'task.assigned', 'task.updated', 'task.completed',
    'task.failed', 'agent.online', 'agent.offline',
    'memory.updated', 'feishu.changed',
  ]),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const P2PRequestSchema = z.object({
  from_agent_id: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
  timeout_ms: z.number().int().min(1000).max(120_000).default(30_000),
});
