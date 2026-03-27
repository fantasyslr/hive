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
});

export const RetryTaskSchema = z.object({
  version: z.number().int().nonnegative(),
});
