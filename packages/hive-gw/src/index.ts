import express from 'express';
import { join } from 'node:path';
import { config, logger } from './config.js';
import { agentsRouter } from './routes/agents.js';
import { tasksRouter } from './routes/tasks.js';
import { boardRouter } from './routes/board.js';
import { eventsRouter } from './routes/events.js';
import { heartbeatRouter } from './routes/heartbeat.js';
import { docsRouter } from './routes/docs.js';
import { startPromptWatcher } from './services/prompt-loader.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(express.json());

// Routes
app.use('/agents', agentsRouter);
app.use('/tasks', tasksRouter);
app.use('/board', boardRouter);
app.use('/events', eventsRouter);
app.use('/heartbeat', heartbeatRouter);
app.use('/', docsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Error handler (must be last)
app.use(errorHandler);

async function start() {
  const promptPath = join(process.cwd(), 'docs', 'orchestrator-prompt.md');
  await startPromptWatcher(promptPath);

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Hive Gateway started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start Gateway');
  process.exit(1);
});

export { app };
