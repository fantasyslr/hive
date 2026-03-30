import { Router } from 'express';
import type { Request, Response } from 'express';
import { createSession } from 'better-sse';
import { HEARTBEAT_INTERVAL_MS, PublishEventSchema } from '@hive/shared';
import type { HiveEventType } from '@hive/shared';
import { EventBus, eventBus } from '../services/event-bus.js';
import { AgentRegistry, registry } from '../services/registry.js';
import { registerHeartbeat } from './heartbeat.js';
import { logger } from '../config.js';

/** Testable handler factory for POST /events */
export function createEventPublishHandler(bus: EventBus, reg: AgentRegistry) {
  return (req: Request, res: Response) => {
    const parsed = PublishEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { agentId, type, data } = parsed.data;
    const agent = reg.get(agentId);
    if (!agent || agent.status !== 'online') {
      res.status(400).json({ error: `Agent ${agentId} not found or offline` });
      return;
    }

    const event = bus.emit({
      type: type as HiveEventType,
      data: { ...data, publishedBy: agentId },
    });

    res.status(201).json({ eventId: event.id });
  };
}

export const eventsRouter = Router();

// POST /events — agent publishes an event to all SSE subscribers
eventsRouter.post('/', createEventPublishHandler(eventBus, registry));

eventsRouter.get('/stream', async (req, res) => {
  const agentId = req.query.agentId as string | undefined;
  if (!agentId) {
    res.status(400).json({ error: 'agentId query parameter is required' });
    return;
  }

  const { found, restored } = registry.updateLastSeen(agentId);
  if (!found) {
    res.status(400).json({ error: `Agent ${agentId} not registered` });
    return;
  }

  const session = await createSession(req, res, {
    keepAlive: HEARTBEAT_INTERVAL_MS,
  });

  // Replay missed events if reconnecting
  const lastEventId = req.headers['last-event-id'];
  if (lastEventId) {
    const missed = eventBus.getEventsAfter(Number(lastEventId));
    for (const evt of missed) {
      session.push(JSON.stringify(evt.data), evt.type, evt.id.toString());
    }
    logger.info({ agentId, replayed: missed.length }, 'Replayed missed events');
  }

  // Register with channel for future broadcasts
  eventBus.getChannel().register(session);

  // Track heartbeat
  registerHeartbeat(agentId);
  if (restored) {
    eventBus.emit({ type: 'agent.online', data: { agentId, reason: 'sse_restored' } });
  }

  logger.info({ agentId }, 'SSE connection established');

  session.on('disconnected', () => {
    eventBus.getChannel().deregister(session);
    logger.info({ agentId }, 'SSE connection closed');
  });
});

// Public SSE stream — no agentId required, read-only board observation
eventsRouter.get('/stream/public', async (req, res) => {
  const session = await createSession(req, res, {
    keepAlive: HEARTBEAT_INTERVAL_MS,
  });

  // Replay missed events if reconnecting
  const lastEventId = req.headers['last-event-id'];
  if (lastEventId) {
    const missed = eventBus.getEventsAfter(Number(lastEventId));
    for (const evt of missed) {
      session.push(JSON.stringify(evt.data), evt.type, evt.id.toString());
    }
    logger.info({ replayed: missed.length }, 'Public SSE replayed missed events');
  }

  // Register with channel for future broadcasts
  eventBus.getChannel().register(session);

  logger.info('Public SSE connection established');

  session.on('disconnected', () => {
    eventBus.getChannel().deregister(session);
    logger.info('Public SSE connection closed');
  });
});
