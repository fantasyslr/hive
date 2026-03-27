import { Router } from 'express';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_MISSES,
  HEARTBEAT_RESPONSE_WINDOW_MS,
} from '@hive/shared';
import { registry } from '../services/registry.js';
import { eventBus } from '../services/event-bus.js';
import { logger } from '../config.js';

export const heartbeatRouter = Router();

const heartbeats = new Map<string, number>();

const TIMEOUT_MS =
  HEARTBEAT_INTERVAL_MS * HEARTBEAT_MAX_MISSES + HEARTBEAT_RESPONSE_WINDOW_MS; // 35_000

heartbeatRouter.post('/:agentId', (req, res) => {
  const { agentId } = req.params;
  heartbeats.set(agentId, Date.now());
  registry.updateLastSeen(agentId);
  res.status(204).end();
});

/** Register initial heartbeat when SSE connects */
export function registerHeartbeat(agentId: string): void {
  heartbeats.set(agentId, Date.now());
}

/** Clean up heartbeat tracking on disconnect */
export function removeHeartbeat(agentId: string): void {
  heartbeats.delete(agentId);
}

// Sweep stale agents every 5 seconds
setInterval(() => {
  const now = Date.now();
  for (const [agentId, lastSeen] of heartbeats) {
    if (now - lastSeen > TIMEOUT_MS) {
      registry.markOffline(agentId);
      heartbeats.delete(agentId);
      eventBus.emit({
        type: 'agent.offline',
        data: { agent_id: agentId, reason: 'heartbeat_timeout' },
      });
      logger.warn({ agentId, silenceMs: now - lastSeen }, 'Agent marked offline (heartbeat timeout)');
    }
  }
}, 5_000);
