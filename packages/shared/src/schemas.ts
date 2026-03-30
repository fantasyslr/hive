import { z } from 'zod/v4';
import { AGENT_PUBLISHABLE_EVENT_TYPES } from './constants.js';

export const AgentRegistrationSchema = z.object({
  agentId: z.string().min(1).max(64),
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
  fromAgentId: z.string().min(1).max(64).optional(),
  toAgentId: z.string().min(1).max(64).optional(),
  contextRef: z.string().max(1024).optional(),
  artifacts: z.array(z.string()).optional(),
  // Orchestration metadata (OMC-inspired, optional)
  taskKind: z.string().min(1).max(32).optional(),
  parentTaskId: z.string().min(1).max(64).optional(),
  runId: z.string().min(1).max(64).optional(),
  verificationRequired: z.boolean().optional(),
});

export const ClaimTaskSchema = z.object({
  agentId: z.string().min(1),
  version: z.number().int().nonnegative(),
});

export const UpdateTaskSchema = z.object({
  agentId: z.string().min(1),
  version: z.number().int().nonnegative(),
  status: z.enum(['working', 'done', 'failed']),
  result: z.string().nullish(),
  error: z.string().nullish(),
  outputRefs: z.array(z.string()).optional(),
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
  agentId: z.string().min(1).max(64),
  type: z.enum(AGENT_PUBLISHABLE_EVENT_TYPES),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const P2PRequestSchema = z.object({
  fromAgentId: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
  timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
});
