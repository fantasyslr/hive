import { Router } from 'express';
import { CreateTaskSchema, ClaimTaskSchema, UpdateTaskSchema, RetryTaskSchema } from '@hive/shared';
import type { TaskStatus } from '@hive/shared';
import { validate } from '../middleware/validate.js';
import { taskMachine } from '../services/task-machine.js';
import { registry } from '../services/registry.js';
import { Dispatcher, scoreAgent } from '../services/dispatcher.js';
import { eventBus } from '../services/event-bus.js';
import { NotFoundError } from '../middleware/error-handler.js';

const dispatcher = new Dispatcher(registry, taskMachine);

export const tasksRouter = Router();

tasksRouter.post('/', validate(CreateTaskSchema), (req, res) => {
  const task = taskMachine.create(req.body);

  // Try auto-assign
  const result = dispatcher.autoAssign(task);
  if (result) {
    eventBus.emit({
      type: 'task.assigned',
      data: { taskId: result.task.id, agentId: result.agent.agentId, title: result.task.title },
    });
    res.status(201).json({ ...result.task, autoAssignedTo: result.agent.agentId });
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

tasksRouter.get('/:id/routing-score', (req, res) => {
  const task = taskMachine.get(req.params.id);
  if (!task) throw new NotFoundError(`Task ${req.params.id} not found`);

  const scores = dispatcher.scoreAllAgents(task);
  // Enrich scores (includes starvation field) with lastAssignedAt for observability
  const enriched = scores.map(s => ({
    ...s,
    lastAssignedAt: dispatcher.getLastAssigned(s.agentId) ?? null,
  }));
  res.json(enriched);
});

tasksRouter.post('/:id/claim', validate(ClaimTaskSchema), (req, res) => {
  const taskId = req.params.id as string;
  const { agentId, version } = req.body as { agentId: string; version: number };
  const agent = registry.get(agentId);
  if (!agent || agent.status !== 'online') {
    res.status(400).json({ error: `Agent ${agentId} not found or offline` });
    return;
  }
  const task = taskMachine.claim(taskId, agentId, version);
  eventBus.emit({
    type: 'task.assigned',
    data: { taskId: task.id, agentId },
  });
  res.json(task);
});

tasksRouter.post('/:id/reject', validate(ClaimTaskSchema), (req, res) => {
  const taskId = req.params.id as string;
  const { agentId, version } = req.body as { agentId: string; version: number };
  const task = taskMachine.reject(taskId, agentId, version);
  eventBus.emit({
    type: 'task.updated',
    data: { taskId: task.id, agentId, action: 'rejected', status: 'pending' },
  });
  res.json(task);
});

tasksRouter.patch('/:id', validate(UpdateTaskSchema), (req, res) => {
  const taskId = req.params.id as string;
  const { agentId, version, status, result, error, outputRefs } = req.body as {
    agentId: string;
    version: number;
    status: 'working' | 'done' | 'failed';
    result?: string | null;
    error?: string | null;
    outputRefs?: string[];
  };
  let task = taskMachine.transition(taskId, status, agentId, version, { result, error });

  // If agent explicitly provides outputRefs, set them (replace semantics, bumps version)
  if (outputRefs) {
    task = taskMachine.setOutputRefs(task.id, outputRefs) ?? task;
  }

  // Emit event based on new status
  const statusToEvent: Record<string, 'task.completed' | 'task.failed' | 'task.updated'> = {
    done: 'task.completed',
    failed: 'task.failed',
    working: 'task.updated',
  };
  const eventType = statusToEvent[status];
  if (eventType) {
    eventBus.emit({
      type: eventType,
      data: {
        taskId: task.id,
        agentId,
        version: task.version,
        outputRefs: task.outputRefs ?? [],
        ...(status === 'done' && { result: task.result }),
        ...(status === 'failed' && { error: task.error }),
        ...(status === 'working' && { status: 'working' }),
      },
    });
  }

  res.json(task);
});

tasksRouter.post('/:id/retry', validate(RetryTaskSchema), (req, res) => {
  const taskId = req.params.id as string;
  const { version } = req.body as { version: number };
  const task = taskMachine.retry(taskId, version);
  eventBus.emit({
    type: 'task.updated',
    data: { taskId: task.id, status: 'pending', retry: true },
  });

  // Try auto-assign the retried task
  const result = dispatcher.autoAssign(task);
  if (result) {
    eventBus.emit({
      type: 'task.assigned',
      data: { taskId: result.task.id, agentId: result.agent.agentId },
    });
    res.json({ ...result.task, autoAssignedTo: result.agent.agentId });
    return;
  }

  res.json(task);
});

tasksRouter.delete('/:id', (req, res) => {
  const taskId = req.params.id as string;
  const task = taskMachine.delete(taskId);
  eventBus.emit({
    type: 'task.updated',
    data: { taskId: task.id, deleted: true, previousStatus: task.status },
  });
  res.json({ deleted: true, task });
});
