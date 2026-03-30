import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';
import { tasksRouter } from './tasks.js';
import {
  heartbeatRouter,
  getHeartbeatLastSeen,
  registerHeartbeat,
  setHeartbeatLastSeen,
  sweepStaleHeartbeats,
  HEARTBEAT_TIMEOUT_MS,
} from './heartbeat.js';
import { eventsRouter } from './events.js';
import { errorHandler } from '../middleware/error-handler.js';
import { registry } from '../services/registry.js';
import { taskMachine } from '../services/task-machine.js';
import { eventBus } from '../services/event-bus.js';
import type { HiveEvent } from '@hive/shared';

async function startServer(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = await new Promise<ReturnType<Express['listen']>>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }),
  };
}

describe.sequential('review fixes', () => {
  const listeners: Array<{ type: string; handler: (event: HiveEvent) => void }> = [];

  beforeEach(() => {
    registry.clear();
    taskMachine.clear();
  });

  afterEach(() => {
    for (const { type, handler } of listeners.splice(0)) {
      eventBus.off(type, handler);
    }
    registry.clear();
    taskMachine.clear();
  });

  it('rejects claim requests for unknown or offline agents', async () => {
    const app = express();
    app.use(express.json());
    app.use('/tasks', tasksRouter);
    app.use(errorHandler);

    const { baseUrl, close } = await startServer(app);

    try {
      const task = taskMachine.create({
        title: 'Write code',
        description: 'Ship a fix',
        requiredCapabilities: ['code'],
        createdBy: 'user-1',
      });

      let response = await fetch(`${baseUrl}/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'missing-agent', version: task.version }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent missing-agent not found or offline' });

      registry.register({
        agentId: 'offline-agent',
        name: 'Offline Agent',
        capabilities: ['code'],
        interests: [],
        endpoint: 'http://localhost:3001',
      });
      registry.markOffline('offline-agent');

      response = await fetch(`${baseUrl}/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'offline-agent', version: task.version }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent offline-agent not found or offline' });
      expect(taskMachine.get(task.id)?.status).toBe('pending');
    } finally {
      await close();
    }
  });

  it('returns the latest task including output refs after PATCH updates', async () => {
    const app = express();
    app.use(express.json());
    app.use('/tasks', tasksRouter);
    app.use(errorHandler);

    const { baseUrl, close } = await startServer(app);

    try {
      registry.register({
        agentId: 'agent-a',
        name: 'Agent A',
        capabilities: ['code'],
        interests: ['code'],
        endpoint: 'http://localhost:3001',
      });

      const completedEvents: HiveEvent[] = [];
      const handler = (event: HiveEvent) => completedEvents.push(event);
      listeners.push({ type: 'task.completed', handler });
      eventBus.on('task.completed', handler);

      const task = taskMachine.create({
        title: 'Write code',
        description: 'Ship a fix',
        requiredCapabilities: ['code'],
        createdBy: 'user-1',
      });
      const claimed = taskMachine.claim(task.id, 'agent-a', task.version);
      const working = taskMachine.transition(task.id, 'working', 'agent-a', claimed.version);

      const response = await fetch(`${baseUrl}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'agent-a',
          version: working.version,
          status: 'done',
          result: 'done',
          outputRefs: ['mem://explicit'],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.outputRefs).toEqual(['mem://explicit']);
      expect(body.version).toBe(working.version + 2);
      expect(taskMachine.get(task.id)?.outputRefs).toEqual(['mem://explicit']);
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].data).toMatchObject({
        taskId: task.id,
        agentId: 'agent-a',
        version: body.version,
        outputRefs: ['mem://explicit'],
        result: 'done',
      });
    } finally {
      await close();
    }
  });

  it('restores offline agents on heartbeat and rejects unknown agent IDs', async () => {
    const app = express();
    app.use(express.json());
    app.use('/heartbeat', heartbeatRouter);
    app.use(errorHandler);

    const { baseUrl, close } = await startServer(app);

    try {
      const onlineEvents: HiveEvent[] = [];
      const handler = (event: HiveEvent) => onlineEvents.push(event);
      listeners.push({ type: 'agent.online', handler });
      eventBus.on('agent.online', handler);

      registry.register({
        agentId: 'agent-heartbeat',
        name: 'Agent Heartbeat',
        capabilities: ['code'],
        interests: [],
        endpoint: 'http://localhost:3001',
      });
      registry.markOffline('agent-heartbeat');

      let response = await fetch(`${baseUrl}/heartbeat/agent-heartbeat`, { method: 'POST' });
      expect(response.status).toBe(204);
      expect(registry.get('agent-heartbeat')?.status).toBe('online');
      expect(getHeartbeatLastSeen('agent-heartbeat')).toBeTypeOf('number');
      expect(onlineEvents).toHaveLength(1);
      expect(onlineEvents[0].data).toMatchObject({
        agentId: 'agent-heartbeat',
        reason: 'heartbeat_restored',
      });

      response = await fetch(`${baseUrl}/heartbeat/missing-agent`, { method: 'POST' });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent missing-agent not registered' });
    } finally {
      await close();
    }
  });

  it('marks stale SSE heartbeats offline and releases claimed tasks', () => {
    const offlineEvents: HiveEvent[] = [];
    const updatedEvents: HiveEvent[] = [];
    const offlineHandler = (event: HiveEvent) => offlineEvents.push(event);
    const updatedHandler = (event: HiveEvent) => updatedEvents.push(event);
    listeners.push({ type: 'agent.offline', handler: offlineHandler });
    listeners.push({ type: 'task.updated', handler: updatedHandler });
    eventBus.on('agent.offline', offlineHandler);
    eventBus.on('task.updated', updatedHandler);

    registry.register({
      agentId: 'reclaim-agent',
      name: 'Reclaim Agent',
      capabilities: ['research'],
      interests: [],
      endpoint: 'http://localhost:9994',
    });

    const claimed = taskMachine.create({
      title: 'Reclaim me',
      description: 'claimed task for offline reclaim validation',
      requiredCapabilities: ['research'],
      createdBy: 'test',
    });
    taskMachine.claim(claimed.id, 'reclaim-agent', claimed.version);

    const working = taskMachine.create({
      title: 'Keep working',
      description: 'working task should not be reclaimed',
      requiredCapabilities: ['research'],
      createdBy: 'test',
    });
    const workingClaimed = taskMachine.claim(working.id, 'reclaim-agent', working.version);
    taskMachine.transition(working.id, 'working', 'reclaim-agent', workingClaimed.version);

    registerHeartbeat('reclaim-agent');
    const staleNow = Date.now();
    const staleAt = staleNow - HEARTBEAT_TIMEOUT_MS - 1;
    expect(getHeartbeatLastSeen('reclaim-agent')).toBeTypeOf('number');

    setHeartbeatLastSeen('reclaim-agent', staleAt);
    sweepStaleHeartbeats(staleNow);

    expect(registry.get('reclaim-agent')?.status).toBe('offline');
    expect(taskMachine.get(claimed.id)).toMatchObject({
      status: 'pending',
      assignee: null,
    });
    expect(taskMachine.get(working.id)).toMatchObject({
      status: 'working',
      assignee: 'reclaim-agent',
    });

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].data).toMatchObject({
      taskId: claimed.id,
      status: 'pending',
      previousStatus: 'claimed',
      releasedFromAgentId: 'reclaim-agent',
      reason: 'assignee_offline',
    });

    expect(offlineEvents).toHaveLength(1);
    expect(offlineEvents[0].data).toMatchObject({
      agentId: 'reclaim-agent',
      reason: 'heartbeat_timeout',
    });
  });

  it('rejects SSE connections for unregistered agents before opening a stream', async () => {
    const app = express();
    app.use('/events', eventsRouter);
    app.use(errorHandler);

    const { baseUrl, close } = await startServer(app);

    try {
      const response = await fetch(`${baseUrl}/events/stream?agentId=missing-agent`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent missing-agent not registered' });
    } finally {
      await close();
    }
  });

  it('keeps heartbeat tracking after SSE disconnect so timeout reclaim can still happen', async () => {
    const app = express();
    app.use('/events', eventsRouter);
    app.use(errorHandler);

    registry.register({
      agentId: 'stream-agent',
      name: 'Stream Agent',
      capabilities: ['research'],
      interests: [],
      endpoint: 'http://localhost:9993',
    });

    const { baseUrl, close } = await startServer(app);

    try {
      const response = await fetch(`${baseUrl}/events/stream?agentId=stream-agent`);
      expect(response.status).toBe(200);
      expect(getHeartbeatLastSeen('stream-agent')).toBeTypeOf('number');
      response.body?.cancel();

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(getHeartbeatLastSeen('stream-agent')).toBeTypeOf('number');
    } finally {
      await close();
    }
  });
});
