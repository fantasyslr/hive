import express from 'express';
import { join } from 'node:path';
import { config, logger } from './config.js';
import { agentsRouter } from './routes/agents.js';
import { tasksRouter } from './routes/tasks.js';
import { boardRouter } from './routes/board.js';
import { eventsRouter } from './routes/events.js';
import { heartbeatRouter } from './routes/heartbeat.js';
import { docsRouter } from './routes/docs.js';
import { createMemoryRouter } from './routes/memory.js';
import { startPromptWatcher } from './services/prompt-loader.js';
import { memoryClient } from './services/memory-client.js';
import { eventBus } from './services/event-bus.js';
import { taskMachine } from './services/task-machine.js';
import { MemoryService } from './services/memory-service.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(express.json());

// Memory service (created before routes so the router can reference it)
const memoryService = new MemoryService(memoryClient, eventBus, taskMachine);
const memoryRouter = createMemoryRouter(memoryService);

// Routes
app.use('/agents', agentsRouter);
app.use('/tasks', tasksRouter);
app.use('/board', boardRouter);
app.use('/events', eventsRouter);
app.use('/heartbeat', heartbeatRouter);
app.use('/memory', memoryRouter);
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

  // Initialize memory service (non-blocking — runs in degraded mode if unavailable)
  const memReady = await memoryService.init();
  if (memReady) {
    memoryService.registerHooks();
  }

  app.listen(config.port, () => {
    logger.info({ port: config.port, memoryReady: memReady }, 'Hive Gateway started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start Gateway');
  process.exit(1);
});

export { app };
