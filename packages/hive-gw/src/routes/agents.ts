import { Router } from 'express';
import { AgentRegistrationSchema } from '@hive/shared';
import { validate } from '../middleware/validate.js';
import { registry } from '../services/registry.js';
import { NotFoundError } from '../middleware/error-handler.js';

export const agentsRouter = Router();

agentsRouter.post('/', validate(AgentRegistrationSchema), (req, res) => {
  const { agent, action } = registry.register(req.body);
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

agentsRouter.delete('/:agent_id', (req, res) => {
  const removed = registry.remove(req.params.agent_id);
  if (!removed) throw new NotFoundError(`Agent ${req.params.agent_id} not found`);
  res.status(204).end();
});
