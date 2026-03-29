import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';
import { tasksRouter } from './tasks.js';
import { heartbeatRouter } from './heartbeat.js';
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
        body: JSON.stringify({ agent_id: 'missing-agent', version: task.version }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent missing-agent not found or offline' });

      registry.register({
        agent_id: 'offline-agent',
        name: 'Offline Agent',
        capabilities: ['code'],
        interests: [],
        endpoint: 'http://localhost:3001',
      });
      registry.markOffline('offline-agent');

      response = await fetch(`${baseUrl}/tasks/${task.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'offline-agent', version: task.version }),
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
        agent_id: 'agent-a',
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
          agent_id: 'agent-a',
          version: working.version,
          status: 'done',
          result: 'done',
          output_refs: ['mem://explicit'],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output_refs).toEqual(['mem://explicit']);
      expect(body.version).toBe(working.version + 2);
      expect(taskMachine.get(task.id)?.output_refs).toEqual(['mem://explicit']);
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].data).toMatchObject({
        task_id: task.id,
        agent_id: 'agent-a',
        version: body.version,
        output_refs: ['mem://explicit'],
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
        agent_id: 'agent-heartbeat',
        name: 'Agent Heartbeat',
        capabilities: ['code'],
        interests: [],
        endpoint: 'http://localhost:3001',
      });
      registry.markOffline('agent-heartbeat');

      let response = await fetch(`${baseUrl}/heartbeat/agent-heartbeat`, { method: 'POST' });
      expect(response.status).toBe(204);
      expect(registry.get('agent-heartbeat')?.status).toBe('online');
      expect(onlineEvents).toHaveLength(1);
      expect(onlineEvents[0].data).toMatchObject({
        agent_id: 'agent-heartbeat',
        reason: 'heartbeat_restored',
      });

      response = await fetch(`${baseUrl}/heartbeat/missing-agent`, { method: 'POST' });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent missing-agent not registered' });
    } finally {
      await close();
    }
  });

  it('rejects SSE connections for unregistered agents before opening a stream', async () => {
    const app = express();
    app.use('/events', eventsRouter);
    app.use(errorHandler);

    const { baseUrl, close } = await startServer(app);

    try {
      const response = await fetch(`${baseUrl}/events/stream?agent_id=missing-agent`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Agent missing-agent not registered' });
    } finally {
      await close();
    }
  });
});
