import { describe, it, expect, beforeEach } from 'vitest';
import type { RegisteredAgent, Task } from '@hive/shared';
import { ROUTING_WEIGHTS, STARVATION_THRESHOLD_MS, STARVATION_BOOST } from '@hive/shared';
import { scoreAgent, Dispatcher } from './dispatcher.js';
import { AgentRegistry } from './registry.js';
import { TaskMachine } from './task-machine.js';

function makeAgent(overrides: Partial<RegisteredAgent> = {}): RegisteredAgent {
  return {
    agentId: 'agent-1',
    name: 'Test Agent',
    capabilities: ['code'],
    interests: [],
    endpoint: 'http://localhost:3001',
    status: 'online',
    registeredAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Write code',
    description: 'Implement feature',
    requiredCapabilities: ['code'],
    status: 'pending',
    assignee: null,
    createdBy: 'user-1',
    result: null,
    error: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('scoreAgent', () => {
  it('returns higher score for agent with matching interest than agent without', () => {
    const task = makeTask({ requiredCapabilities: ['code'] });
    const loadMap = new Map<string, number>();

    const matched = makeAgent({ agentId: 'a1', capabilities: ['code'], interests: ['code'] });
    const unmatched = makeAgent({ agentId: 'a2', capabilities: ['code'], interests: [] });

    const s1 = scoreAgent(matched, task, loadMap);
    const s2 = scoreAgent(unmatched, task, loadMap);

    expect(s1.interest).toBe(ROUTING_WEIGHTS.INTEREST_MATCH);
    expect(s2.interest).toBe(0);
    expect(s1.total).toBeGreaterThan(s2.total);
  });

  it('returns 0 total for agent missing required capability', () => {
    const task = makeTask({ requiredCapabilities: ['code', 'deploy'] });
    const agent = makeAgent({ capabilities: ['code'] }); // missing 'deploy'
    const loadMap = new Map<string, number>();

    const score = scoreAgent(agent, task, loadMap);
    expect(score.capability).toBe(0);
    expect(score.total).toBe(0);
  });

  it('among equal-interest agents, least-loaded wins', () => {
    const task = makeTask({ requiredCapabilities: ['code'] });
    const loadMap = new Map<string, number>([
      ['a1', 2],
      ['a2', 0],
      ['a3', 1],
    ]);

    const a1 = makeAgent({ agentId: 'a1', capabilities: ['code'], interests: ['code'] });
    const a2 = makeAgent({ agentId: 'a2', capabilities: ['code'], interests: ['code'] });
    const a3 = makeAgent({ agentId: 'a3', capabilities: ['code'], interests: ['code'] });

    const s1 = scoreAgent(a1, task, loadMap);
    const s2 = scoreAgent(a2, task, loadMap);
    const s3 = scoreAgent(a3, task, loadMap);

    // a2 (load 0) > a3 (load 1) > a1 (load 2)
    expect(s2.total).toBeGreaterThan(s3.total);
    expect(s3.total).toBeGreaterThan(s1.total);
  });

  it('interest match score (50) outweighs load score difference (max 30)', () => {
    const task = makeTask({ requiredCapabilities: ['code'] });
    const loadMap = new Map<string, number>([
      ['interested', 3], // max load -> load score 0
      ['idle', 0],       // no load -> load score 30
    ]);

    const interested = makeAgent({ agentId: 'interested', capabilities: ['code'], interests: ['code'] });
    const idle = makeAgent({ agentId: 'idle', capabilities: ['code'], interests: [] });

    const s1 = scoreAgent(interested, task, loadMap);
    const s2 = scoreAgent(idle, task, loadMap);

    // interested (50+20+0=70) > idle (0+20+30=50)
    expect(s1.total).toBeGreaterThan(s2.total);
  });

  it('matches interest via substring in task title', () => {
    const task = makeTask({ title: 'Deploy the new service', requiredCapabilities: ['code'] });
    const agent = makeAgent({ capabilities: ['code'], interests: ['deploy'] });
    const loadMap = new Map<string, number>();

    const score = scoreAgent(agent, task, loadMap);
    expect(score.interest).toBe(ROUTING_WEIGHTS.INTEREST_MATCH);
  });
});

describe('Dispatcher', () => {
  let registry: AgentRegistry;
  let taskMachine: TaskMachine;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    registry = new AgentRegistry();
    taskMachine = new TaskMachine();
    dispatcher = new Dispatcher(registry, taskMachine);
  });

  it('findBestAgent returns null when no online agents have required capabilities', () => {
    registry.register({ agentId: 'a1', name: 'A1', capabilities: ['design'], interests: [], endpoint: 'http://localhost:3001' });

    const task = makeTask({ requiredCapabilities: ['code'] });
    const result = dispatcher.findBestAgent(task.requiredCapabilities, task);
    expect(result).toBeNull();
  });

  it('findBestAgent falls back to capability-only when no interest matches', () => {
    registry.register({ agentId: 'a1', name: 'A1', capabilities: ['code'], interests: ['design'], endpoint: 'http://localhost:3001' });
    registry.register({ agentId: 'a2', name: 'A2', capabilities: ['code'], interests: ['writing'], endpoint: 'http://localhost:3002' });

    const task = makeTask({ requiredCapabilities: ['code'], title: 'Review PR' });
    const result = dispatcher.findBestAgent(task.requiredCapabilities, task);

    // Should still return an agent even though no interest matches
    expect(result).not.toBeNull();
    expect(result!.capabilities).toContain('code');
  });

  it('autoAssign claims task and returns assigned task+agent', () => {
    registry.register({ agentId: 'a1', name: 'A1', capabilities: ['code'], interests: ['code'], endpoint: 'http://localhost:3001' });

    const task = taskMachine.create({ title: 'Code task', description: 'desc', requiredCapabilities: ['code'], createdBy: 'user-1' });
    const result = dispatcher.autoAssign(task);

    expect(result).not.toBeNull();
    expect(result!.task.status).toBe('claimed');
    expect(result!.task.assignee).toBe('a1');
    expect(result!.agent.agentId).toBe('a1');
  });
});

/** Helper: returns ISO timestamp for `ms` milliseconds ago */
function mockTimeAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('scoreAgent — starvation boost', () => {
  it('agent idle > 60s gets starvation boost', () => {
    const agent = makeAgent({ agentId: 'starved', capabilities: ['code'], interests: [] });
    const task = makeTask({ requiredCapabilities: ['code'] });
    const loadMap = new Map<string, number>();
    const lastAssignedAt = mockTimeAgo(STARVATION_THRESHOLD_MS + 1000); // 61s ago

    const score = scoreAgent(agent, task, loadMap, { lastAssignedAt, hasActiveTasks: false });
    expect(score.starvation).toBe(STARVATION_BOOST);
    expect(score.total).toBe(0 + ROUTING_WEIGHTS.CAPABILITY_MATCH + ROUTING_WEIGHTS.LOAD_BASE + STARVATION_BOOST);
  });

  it('agent idle < 60s gets 0 starvation boost', () => {
    const agent = makeAgent({ agentId: 'recent', capabilities: ['code'], interests: [] });
    const task = makeTask({ requiredCapabilities: ['code'] });
    const loadMap = new Map<string, number>();
    const lastAssignedAt = mockTimeAgo(STARVATION_THRESHOLD_MS - 10_000); // 50s ago

    const score = scoreAgent(agent, task, loadMap, { lastAssignedAt, hasActiveTasks: false });
    expect(score.starvation).toBe(0);
  });

  it('starvation boost elevates niche agent over interest-matched agent', () => {
    const task = makeTask({ requiredCapabilities: ['code'], title: 'Code review' });
    const loadMap = new Map<string, number>([['busy', 3]]);

    // Interest-matched but busy: interest=50, cap=20, load=0 => 70
    const busy = makeAgent({ agentId: 'busy', capabilities: ['code'], interests: ['code'] });
    const busyScore = scoreAgent(busy, task, loadMap);

    // Starved niche agent: interest=0, cap=20, load=30, starvation=40 => 90
    const niche = makeAgent({ agentId: 'niche', capabilities: ['code'], interests: ['design'] });
    const nicheScore = scoreAgent(niche, task, loadMap, { lastAssignedAt: mockTimeAgo(120_000), hasActiveTasks: false });

    expect(nicheScore.total).toBeGreaterThan(busyScore.total);
  });

  it('agent with active tasks gets 0 starvation boost regardless of idle time', () => {
    const agent = makeAgent({ agentId: 'active', capabilities: ['code'], interests: [] });
    const task = makeTask({ requiredCapabilities: ['code'] });
    const loadMap = new Map<string, number>();
    const lastAssignedAt = mockTimeAgo(STARVATION_THRESHOLD_MS + 5000); // 65s ago

    const score = scoreAgent(agent, task, loadMap, { lastAssignedAt, hasActiveTasks: true });
    expect(score.starvation).toBe(0);
  });

  it('lastAssignedAt resets after autoAssign', () => {
    const registry = new AgentRegistry();
    const taskMachine = new TaskMachine();
    const dispatcher = new Dispatcher(registry, taskMachine);

    registry.register({ agentId: 'a1', name: 'A1', capabilities: ['code'], interests: [], endpoint: 'http://localhost:3001' });

    const task = taskMachine.create({ title: 'Task 1', description: 'desc', requiredCapabilities: ['code'], createdBy: 'user-1' });
    const result = dispatcher.autoAssign(task);
    expect(result).not.toBeNull();

    // After assignment, lastAssigned should be recent — scoring should NOT give starvation boost
    const lastAssigned = dispatcher.getLastAssigned('a1');
    expect(lastAssigned).toBeDefined();
    const elapsed = Date.now() - new Date(lastAssigned!).getTime();
    expect(elapsed).toBeLessThan(5000); // assigned within last 5 seconds
  });
});
