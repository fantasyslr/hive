import { Router } from 'express';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_MISSES,
  HEARTBEAT_RESPONSE_WINDOW_MS,
} from '@hive/shared';
import { registry } from '../services/registry.js';
import { taskMachine } from '../services/task-machine.js';
import { eventBus } from '../services/event-bus.js';
import { logger } from '../config.js';

export const heartbeatRouter = Router();

const heartbeats = new Map<string, number>();

export const HEARTBEAT_TIMEOUT_MS =
  HEARTBEAT_INTERVAL_MS * HEARTBEAT_MAX_MISSES + HEARTBEAT_RESPONSE_WINDOW_MS; // 35_000

function markAgentOffline(agentId: string, silenceMs: number): void {
  registry.markOffline(agentId);
  heartbeats.delete(agentId);

  const releasedTasks = taskMachine.releaseClaimedTasksForAgent(agentId);
  for (const task of releasedTasks) {
    eventBus.emit({
      type: 'task.updated',
      data: {
        taskId: task.id,
        status: 'pending',
        previousStatus: 'claimed',
        releasedFromAgentId: agentId,
        reason: 'assignee_offline',
        version: task.version,
      },
    });
  }

  eventBus.emit({
    type: 'agent.offline',
    data: { agentId, reason: 'heartbeat_timeout' },
  });
  logger.warn(
    { agentId, silenceMs, releasedClaimedTasks: releasedTasks.map((task) => task.id) },
    'Agent marked offline (heartbeat timeout)',
  );
}

heartbeatRouter.post('/:agentId', (req, res) => {
  const { agentId } = req.params;
  const { found, restored } = registry.updateLastSeen(agentId);
  if (!found) {
    res.status(400).json({ error: `Agent ${agentId} not registered` });
    return;
  }

  heartbeats.set(agentId, Date.now());
  if (restored) {
    eventBus.emit({ type: 'agent.online', data: { agentId, reason: 'heartbeat_restored' } });
    logger.info({ agentId }, 'Agent restored to online via heartbeat');
  }
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

/** Test/debug helper: inspect tracked heartbeat timestamp for an agent. */
export function getHeartbeatLastSeen(agentId: string): number | undefined {
  return heartbeats.get(agentId);
}

/** Test/debug helper: force a specific heartbeat timestamp. */
export function setHeartbeatLastSeen(agentId: string, timestamp: number): void {
  heartbeats.set(agentId, timestamp);
}

/** Test/debug helper: run one sweep pass immediately. */
export function sweepStaleHeartbeats(now = Date.now()): void {
  for (const [agentId, lastSeen] of heartbeats) {
    if (now - lastSeen > HEARTBEAT_TIMEOUT_MS) {
      markAgentOffline(agentId, now - lastSeen);
    }
  }
}

// Sweep stale agents every 5 seconds
const sweepTimer = setInterval(() => {
  sweepStaleHeartbeats();
}, 5_000);

sweepTimer.unref?.();
