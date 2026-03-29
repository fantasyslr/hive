import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../services/event-bus.js';
import { AgentRegistry } from '../services/registry.js';
import { createEventPublishHandler } from './events.js';
import type { HiveEventType } from '@hive/shared';

describe('POST /events — agent event publishing', () => {
  let bus: EventBus;
  let reg: AgentRegistry;
  let handler: ReturnType<typeof createEventPublishHandler>;

  beforeEach(() => {
    bus = new EventBus(100);
    reg = new AgentRegistry();
    handler = createEventPublishHandler(bus, reg);
  });

  function mockReq(body: Record<string, unknown>) {
    return { body } as any;
  }
  function mockRes() {
    let statusCode = 200;
    let jsonBody: unknown;
    return {
      status(code: number) { statusCode = code; return this; },
      json(body: unknown) { jsonBody = body; return this; },
      get statusCode() { return statusCode; },
      get jsonBody() { return jsonBody; },
    } as any;
  }

  it('registered online agent can publish a whitelisted event', () => {
    reg.register({
      agent_id: 'agent-1', name: 'A1', capabilities: ['x'],
      interests: [], endpoint: 'http://localhost:4000',
    });
    const emitted: any[] = [];
    bus.on('task.updated', (e) => emitted.push(e));

    const req = mockReq({ agent_id: 'agent-1', type: 'task.updated', data: { foo: 'bar' } });
    const res = mockRes();
    handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].data.foo).toBe('bar');
    expect(emitted[0].data.published_by).toBe('agent-1');
  });

  it('rejects unregistered agent with 400', () => {
    const req = mockReq({ agent_id: 'ghost', type: 'task.updated', data: {} });
    const res = mockRes();
    handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects offline agent with 400', () => {
    reg.register({
      agent_id: 'agent-2', name: 'A2', capabilities: ['x'],
      interests: [], endpoint: 'http://localhost:4001',
    });
    reg.markOffline('agent-2');

    const req = mockReq({ agent_id: 'agent-2', type: 'task.updated', data: {} });
    const res = mockRes();
    handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-whitelisted event type with 400', () => {
    reg.register({
      agent_id: 'agent-1', name: 'A1', capabilities: ['x'],
      interests: [], endpoint: 'http://localhost:4000',
    });

    const req = mockReq({ agent_id: 'agent-1', type: 'hacked.event', data: {} });
    const res = mockRes();
    handler(req, res);

    expect(res.statusCode).toBe(400);
  });
});
