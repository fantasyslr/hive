import express from 'express';
import { config, logger } from './config.js';
import { agentsRouter } from './routes/agents.js';
import { tasksRouter } from './routes/tasks.js';
import { boardRouter } from './routes/board.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(express.json());

// Routes
app.use('/agents', agentsRouter);
app.use('/tasks', tasksRouter);
app.use('/board', boardRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Hive Gateway started');
});

export { app };
