import { Router } from 'express';
import type { BoardSnapshot } from '@hive/shared';
import { registry } from '../services/registry.js';
import { taskMachine } from '../services/task-machine.js';

export const boardRouter = Router();

boardRouter.get('/', (_req, res) => {
  const snapshot: BoardSnapshot = {
    agents: registry.getAll(),
    tasks: taskMachine.getAll(),
    timestamp: new Date().toISOString(),
  };
  res.json(snapshot);
});
