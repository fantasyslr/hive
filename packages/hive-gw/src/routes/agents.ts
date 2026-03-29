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
  eventBus.emit({ type: 'agent.online', data: { agent_id: agent.agent_id, name: agent.name } });
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
 * so agents can address each other by agent_id alone.
 *
 * POST /agents/:agent_id/request
 * Body: { from_agent_id, payload, timeout_ms? }
 */
agentsRouter.post('/:agent_id/request', validate(P2PRequestSchema), async (req, res, next) => {
  try {
    const targetId = req.params.agent_id as string;
    const { from_agent_id, payload, timeout_ms } = req.body as {
      from_agent_id: string;
      payload: Record<string, unknown>;
      timeout_ms?: number;
    };

    // Validate source agent exists and is online
    const sourceAgent = registry.get(from_agent_id);
    if (!sourceAgent || sourceAgent.status !== 'online') {
      throw new NotFoundError(`Source agent ${from_agent_id} not found or offline`);
    }

    // Validate target agent exists and is online
    const targetAgent = registry.get(targetId);
    if (!targetAgent || targetAgent.status !== 'online') {
      throw new NotFoundError(`Target agent ${targetId} not found or offline`);
    }

    const result: P2PResponse = await forwardP2PRequest({
      from_agent_id,
      to_agent_id: targetId,
      endpoint: targetAgent.endpoint,
      payload,
      timeout_ms: timeout_ms ?? 30_000,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

agentsRouter.delete('/:agent_id', (req, res) => {
  const removed = registry.remove(req.params.agent_id);
  if (!removed) throw new NotFoundError(`Agent ${req.params.agent_id} not found`);
  eventBus.emit({ type: 'agent.offline', data: { agent_id: req.params.agent_id } });
  res.status(204).end();
});
