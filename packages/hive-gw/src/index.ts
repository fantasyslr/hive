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
import { startTemplateWatcher, stopTemplateWatcher } from './services/template-loader.js';
import { templatesRouter } from './routes/templates.js';
import { memoryClient } from './services/memory-client.js';
import { eventBus } from './services/event-bus.js';
import { taskMachine } from './services/task-machine.js';
import { registry } from './services/registry.js';
import { MemoryService } from './services/memory-service.js';
import { BoardPersistence } from './services/board-persistence.js';
import { VerifyLoop } from './services/verify-loop.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

app.use(express.json());

// Services (created before routes so the router can reference them)
const memoryService = new MemoryService(memoryClient, eventBus, taskMachine);
const boardPersistence = new BoardPersistence(memoryClient, eventBus, registry, taskMachine, memoryService);
const verifyLoop = new VerifyLoop(taskMachine, eventBus);
const memoryRouter = createMemoryRouter(memoryService);

// Health check — unauthenticated (for load balancer / monitoring)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memoryReady: memoryService.isReady(),
  });
});

// Public SSE stream — unauthenticated (browser EventSource cannot set headers)
import { createSession } from 'better-sse';
import { HEARTBEAT_INTERVAL_MS } from '@hive/shared';
app.get('/events/stream/public', async (req, res) => {
  const session = await createSession(req, res, { keepAlive: HEARTBEAT_INTERVAL_MS });
  const lastEventId = req.headers['last-event-id'];
  if (lastEventId) {
    const missed = eventBus.getEventsAfter(Number(lastEventId));
    for (const evt of missed) {
      session.push(JSON.stringify(evt.data), evt.type, evt.id.toString());
    }
  }
  eventBus.getChannel().register(session);
  session.on('disconnected', () => { eventBus.getChannel().deregister(session); });
});

// Auth middleware — all routes below require a valid Bearer token
app.use(authMiddleware);

// Routes (all protected)
app.use('/agents', agentsRouter);
app.use('/tasks', tasksRouter);
app.use('/templates', templatesRouter);
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

// Error handler (must be last)
app.use(errorHandler);

async function start() {
  // 1. Initialize memory service (connect to the configured memory backend, discover tools)
  const memReady = await memoryService.init();
  if (memReady) {
    logger.info('Memory service connected');
  } else {
    logger.warn('Memory service unavailable — running in degraded mode');
  }

  // 2. Initialize board persistence (reuses tool names from memoryService)
  boardPersistence.init();

  // 3. Recover Board state from snapshot (only if memory is ready)
  if (memReady) {
    const recovered = await boardPersistence.loadSnapshot();
    if (recovered) {
      logger.info('Board state recovered from snapshot');
    }
  }

  // 4. Register all hooks (memory auto-write + board persistence + verify loop)
  memoryService.registerHooks();
  boardPersistence.registerHooks();
  verifyLoop.registerHooks();

  // 5. Start prompt watcher
  const promptPath = join(process.cwd(), 'docs', 'orchestrator-prompt.md');
  await startPromptWatcher(promptPath);

  // 6. Start template watcher
  const templatePath = join(process.cwd(), 'templates');
  await startTemplateWatcher(templatePath);

  // 7. Start listening (LAST — only accept connections after recovery complete)
  app.listen(config.port, () => {
    logger.info({ port: config.port, memoryReady: memReady }, 'Hive Gateway started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start Gateway');
  process.exit(1);
});

export { app };
