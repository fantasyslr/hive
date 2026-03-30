import { describe, expect, it } from 'vitest';
import { AgentRegistry } from './registry.js';

describe('AgentRegistry.restore', () => {
  it('preserves registeredAt/lastSeenAt while forcing offline on restore', () => {
    const registry = new AgentRegistry();

    registry.restore({
      agentId: 'restored-agent',
      name: 'Restored Agent',
      capabilities: ['research'],
      interests: [],
      endpoint: 'http://localhost:9999',
      status: 'online',
      registeredAt: '2026-03-30T01:00:00.000Z',
      lastSeenAt: '2026-03-30T02:00:00.000Z',
    }, { forceOffline: true });

    const agent = registry.get('restored-agent');
    expect(agent).toBeTruthy();
    expect(agent?.status).toBe('offline');
    expect(agent?.registeredAt).toBe('2026-03-30T01:00:00.000Z');
    expect(agent?.lastSeenAt).toBe('2026-03-30T02:00:00.000Z');
  });
});
