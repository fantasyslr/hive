import type { AgentCard, RegisteredAgent } from '@hive/shared';

export class AgentRegistry {
  private agents = new Map<string, RegisteredAgent>();

  register(card: AgentCard): { agent: RegisteredAgent; action: 'created' | 'updated' } {
    const existing = this.agents.get(card.agent_id);
    const now = new Date().toISOString();

    if (existing) {
      const updated: RegisteredAgent = {
        ...existing,
        ...card,
        status: 'online',
        lastSeenAt: now,
      };
      this.agents.set(card.agent_id, updated);
      return { agent: updated, action: 'updated' };
    }

    const agent: RegisteredAgent = {
      ...card,
      status: 'online',
      registeredAt: now,
      lastSeenAt: now,
    };
    this.agents.set(card.agent_id, agent);
    return { agent, action: 'created' };
  }

  remove(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  getAll(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  getOnline(): RegisteredAgent[] {
    return this.getAll().filter(a => a.status === 'online');
  }

  markOffline(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'offline';
      agent.lastSeenAt = new Date().toISOString();
    }
  }

  updateLastSeen(agentId: string): { restored: boolean } {
    const agent = this.agents.get(agentId);
    if (!agent) return { restored: false };
    const wasOffline = agent.status === 'offline';
    agent.lastSeenAt = new Date().toISOString();
    if (wasOffline) {
      agent.status = 'online';
    }
    return { restored: wasOffline };
  }
}

export const registry = new AgentRegistry();
