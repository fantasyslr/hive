import { Router } from 'express';
import type { BoardSnapshot } from '@hive/shared';
import { registry } from '../services/registry.js';
import { taskMachine } from '../services/task-machine.js';
import { filterTasksByRole } from '../utils/task-visibility.js';

export const boardRouter = Router();

boardRouter.get('/', (req, res) => {
  const allTasks = taskMachine.getAll();
  // Role-based visibility (AUTH-03)
  const visibleTasks = filterTasksByRole(allTasks, req.user!);
  const snapshot: BoardSnapshot = {
    agents: registry.getAll(),
    tasks: visibleTasks,
    timestamp: new Date().toISOString(),
  };
  res.json(snapshot);
});
