import { Router } from 'express';
import { AgentRegistrationSchema, P2PRequestSchema } from '@hive/shared';
import type { P2PResponse } from '@hive/shared';
import { validate } from '../middleware/validate.js';
import { registry } from '../services/registry.js';
import { eventBus } from '../services/event-bus.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { forwardP2PRequest } from '../services/p2p-proxy.js';

export const agentsRouter = Router();

agentsRouter.post('/', validate(AgentRegistrationSchema), (req, res) => {
  const { agent, action } = registry.register(req.body);
  eventBus.emit({ type: 'agent.online', data: { agentId: agent.agentId, name: agent.name } });
  res.status(action === 'created' ? 201 : 200).json(agent);
});

agentsRouter.get('/', (_req, res) => {
  res.json(registry.getAll());
});

agentsRouter.get('/:agent_id', (req, res) => {
  const agent = registry.get(req.params.agent_id);
  if (!agent) throw new NotFoundError(`Agent ${req.params.agent_id} not found`);
  res.json(agent);
});

/**
 * P2P proxy: forwards a request from one agent to another without the caller
 * needing to know the target agent's endpoint. The gateway acts as a thin relay
 * so agents can address each other by agentId alone.
 *
 * POST /agents/:agent_id/request
 * Body: { fromAgentId, payload, timeoutMs? }
 */
agentsRouter.post('/:agent_id/request', validate(P2PRequestSchema), async (req, res, next) => {
  try {
    const targetId = req.params.agent_id as string;
    const { fromAgentId, payload, timeoutMs } = req.body as {
      fromAgentId: string;
      payload: Record<string, unknown>;
      timeoutMs?: number;
    };

    // Validate source agent exists and is online
    const sourceAgent = registry.get(fromAgentId);
    if (!sourceAgent || sourceAgent.status !== 'online') {
      throw new NotFoundError(`Source agent ${fromAgentId} not found or offline`);
    }

    // Validate target agent exists and is online
    const targetAgent = registry.get(targetId);
    if (!targetAgent || targetAgent.status !== 'online') {
      throw new NotFoundError(`Target agent ${targetId} not found or offline`);
    }

    const result: P2PResponse = await forwardP2PRequest({
      fromAgentId,
      toAgentId: targetId,
      endpoint: targetAgent.endpoint,
      payload,
      timeoutMs: timeoutMs ?? 30_000,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

agentsRouter.delete('/:agent_id', (req, res) => {
  const removed = registry.remove(req.params.agent_id);
  if (!removed) throw new NotFoundError(`Agent ${req.params.agent_id} not found`);
  eventBus.emit({ type: 'agent.offline', data: { agentId: req.params.agent_id } });
  res.status(204).end();
});
