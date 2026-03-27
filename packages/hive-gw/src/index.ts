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
import { createFeishuWebhookRouter } from './routes/feishu-webhook.js';
import { startPromptWatcher } from './services/prompt-loader.js';
import { memoryClient } from './services/memory-client.js';
import { eventBus } from './services/event-bus.js';
import { taskMachine } from './services/task-machine.js';
import { registry } from './services/registry.js';
import { MemoryService } from './services/memory-service.js';
import { BoardPersistence } from './services/board-persistence.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(express.json());

// Services (created before routes so the router can reference them)
const memoryService = new MemoryService(memoryClient, eventBus, taskMachine);
const boardPersistence = new BoardPersistence(memoryClient, eventBus, registry, taskMachine, memoryService);
const memoryRouter = createMemoryRouter(memoryService);

// Routes
app.use('/agents', agentsRouter);
app.use('/tasks', tasksRouter);
app.use('/board', boardRouter);
app.use('/events', eventsRouter);
app.use('/heartbeat', heartbeatRouter);
app.use('/memory', memoryRouter);
// Feishu webhook (conditional on env var)
const feishuWebhookRouter = createFeishuWebhookRouter(eventBus);
if (feishuWebhookRouter) {
  app.use('/webhooks/feishu', feishuWebhookRouter);
}

app.use('/', docsRouter);

// Health check — includes memory status
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memoryReady: memoryService.isReady(),
  });
});

// Error handler (must be last)
app.use(errorHandler);

async function start() {
  // 1. Initialize memory service (connect to Nowledge Mem, discover tools)
  const memReady = await memoryService.init();
  if (memReady) {
    logger.info('Memory service connected to Nowledge Mem');
  } else {
    logger.warn('Memory service unavailable — running in degraded mode');
  }

  // 2. Initialize board persistence (reuses tool names from memoryService)
  boardPersistence.init();

  // 3. Recover Board state from snapshot (only if memory is ready)
  if (memReady) {
    const recovered = await boardPersistence.loadSnapshot();
    if (recovered) {
      logger.info('Board state recovered from Nowledge Mem snapshot');
    }
  }

  // 4. Register all hooks (memory auto-write + board persistence)
  memoryService.registerHooks();
  boardPersistence.registerHooks();

  // 5. Start prompt watcher
  const promptPath = join(process.cwd(), 'docs', 'orchestrator-prompt.md');
  await startPromptWatcher(promptPath);

  // 6. Start listening (LAST — only accept connections after recovery complete)
  app.listen(config.port, () => {
    logger.info({ port: config.port, memoryReady: memReady }, 'Hive Gateway started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start Gateway');
  process.exit(1);
});

export { app };
