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
