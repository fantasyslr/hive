import { describe, expect, it } from 'vitest';
import { AgentRegistry } from './registry.js';

describe('AgentRegistry harness metadata', () => {
  it('stores harnessCapabilities from registration', () => {
    const registry = new AgentRegistry();
    registry.register({
      agentId: 'claude-1',
      name: 'Claude Worker',
      capabilities: ['code'],
      interests: [],
      endpoint: 'http://localhost:9999',
      harnessCapabilities: {
        supportsStructuredOutput: true,
        supportsPersistentSession: true,
        supportsStreaming: true,
        maxContextTokens: 200_000,
      },
    });
    const stored = registry.get('claude-1');
    expect(stored?.harnessCapabilities?.supportsStructuredOutput).toBe(true);
    expect(stored?.harnessCapabilities?.maxContextTokens).toBe(200_000);
  });

  it('stores harnessTools from registration', () => {
    const registry = new AgentRegistry();
    registry.register({
      agentId: 'claude-1',
      name: 'Claude Worker',
      capabilities: ['code'],
      interests: [],
      endpoint: 'http://localhost:9999',
      harnessTools: [
        { name: 'bash', description: 'Execute shell', isReadOnly: false, isConcurrencySafe: false },
      ],
    });
    const stored = registry.get('claude-1');
    expect(stored?.harnessTools).toHaveLength(1);
    expect(stored?.harnessTools?.[0].name).toBe('bash');
  });
});

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
