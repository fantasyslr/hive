import { Router } from 'express';
import { CreateTaskSchema, ClaimTaskSchema, UpdateTaskSchema, RetryTaskSchema } from '@hive/shared';
import type { TaskStatus } from '@hive/shared';
import { validate } from '../middleware/validate.js';
import { taskMachine } from '../services/task-machine.js';
import { registry } from '../services/registry.js';
import { Dispatcher } from '../services/dispatcher.js';
import { NotFoundError } from '../middleware/error-handler.js';

const dispatcher = new Dispatcher(registry, taskMachine);

export const tasksRouter = Router();

tasksRouter.post('/', validate(CreateTaskSchema), (req, res) => {
  const task = taskMachine.create(req.body);

  // Try auto-assign
  const result = dispatcher.autoAssign(task);
  if (result) {
    res.status(201).json({ ...result.task, autoAssignedTo: result.agent.agent_id });
    return;
  }

  res.status(201).json(task);
});

tasksRouter.get('/', (req, res) => {
  let tasks = taskMachine.getAll();
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter) {
    tasks = tasks.filter(t => t.status === statusFilter as TaskStatus);
  }
  res.json(tasks);
});

tasksRouter.get('/:id', (req, res) => {
  const task = taskMachine.get(req.params.id);
  if (!task) throw new NotFoundError(`Task ${req.params.id} not found`);
  res.json(task);
});

tasksRouter.post('/:id/claim', validate(ClaimTaskSchema), (req, res) => {
  const task = taskMachine.claim(req.params.id, req.body.agent_id, req.body.version);
  res.json(task);
});

tasksRouter.patch('/:id', validate(UpdateTaskSchema), (req, res) => {
  const { agent_id, version, status, result, error } = req.body;
  const task = taskMachine.transition(req.params.id, status, agent_id, version, { result, error });
  res.json(task);
});

tasksRouter.post('/:id/retry', validate(RetryTaskSchema), (req, res) => {
  const task = taskMachine.retry(req.params.id, req.body.version);

  // Try auto-assign the retried task
  const result = dispatcher.autoAssign(task);
  if (result) {
    res.json({ ...result.task, autoAssignedTo: result.agent.agent_id });
    return;
  }

  res.json(task);
});
