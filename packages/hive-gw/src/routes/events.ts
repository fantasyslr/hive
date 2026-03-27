import { Router } from 'express';
import { createSession } from 'better-sse';
import { HEARTBEAT_INTERVAL_MS } from '@hive/shared';
import { eventBus } from '../services/event-bus.js';
import { registry } from '../services/registry.js';
import { registerHeartbeat, removeHeartbeat } from './heartbeat.js';
import { logger } from '../config.js';

export const eventsRouter = Router();

eventsRouter.get('/stream', async (req, res) => {
  const agentId = req.query.agent_id as string | undefined;
  if (!agentId) {
    res.status(400).json({ error: 'agent_id query parameter is required' });
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
  registry.updateLastSeen(agentId);

  logger.info({ agentId }, 'SSE connection established');

  session.on('disconnected', () => {
    eventBus.getChannel().deregister(session);
    removeHeartbeat(agentId);
    logger.info({ agentId }, 'SSE connection closed');
  });
});
