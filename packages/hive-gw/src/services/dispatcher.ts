import type { RegisteredAgent, RoutingScore, Task } from '@hive/shared';
import { ROUTING_WEIGHTS, STARVATION_THRESHOLD_MS, STARVATION_BOOST } from '@hive/shared';
import type { AgentRegistry } from './registry.js';
import type { TaskMachine } from './task-machine.js';

export interface StarvationContext {
  lastAssignedAt?: string;
  hasActiveTasks?: boolean;
}

/**
 * Pure scoring function — given an agent, task, and load map, returns a RoutingScore.
 * Agents missing required capabilities get total = 0 (filtered out).
 * Optional starvation context adds boost for idle agents.
 */
export function scoreAgent(
  agent: RegisteredAgent,
  task: Task,
  loadMap: Map<string, number>,
  starvationCtx?: StarvationContext,
): RoutingScore {
  // Capability gate: all required capabilities must be present
  const hasAll = task.requiredCapabilities.every(cap => agent.capabilities.includes(cap));
  if (!hasAll) {
    return { agentId: agent.agentId, interest: 0, capability: 0, load: 0, starvation: 0, total: 0 };
  }

  const capabilityScore = ROUTING_WEIGHTS.CAPABILITY_MATCH;

  // Interest match: agent.interests intersect with requiredCapabilities OR appear as substring of title/description
  const titleLower = task.title.toLowerCase();
  const descLower = task.description.toLowerCase();
  const interestMatch = agent.interests.some(interest => {
    const iLower = interest.toLowerCase();
    return (
      task.requiredCapabilities.some(cap => cap.toLowerCase() === iLower) ||
      titleLower.includes(iLower) ||
      descLower.includes(iLower)
    );
  });
  const interestScore = interestMatch ? ROUTING_WEIGHTS.INTEREST_MATCH : 0;

  // Load score: base minus per-task penalty, floored at 0
  const activeCount = loadMap.get(agent.agentId) ?? 0;
  const loadScore = Math.max(0, ROUTING_WEIGHTS.LOAD_BASE - activeCount * ROUTING_WEIGHTS.LOAD_PER_TASK);

  // Starvation boost: idle agents (no active tasks, idle > threshold) get priority uplift
  let starvationScore = 0;
  if (starvationCtx && !starvationCtx.hasActiveTasks && starvationCtx.lastAssignedAt) {
    const idleMs = Date.now() - new Date(starvationCtx.lastAssignedAt).getTime();
    if (idleMs > STARVATION_THRESHOLD_MS) {
      starvationScore = STARVATION_BOOST;
    }
  }

  return {
    agentId: agent.agentId,
    interest: interestScore,
    capability: capabilityScore,
    load: loadScore,
    starvation: starvationScore,
    total: interestScore + capabilityScore + loadScore + starvationScore,
  };
}

export class Dispatcher {
  private lastAssigned = new Map<string, string>();

  constructor(
    private registry: AgentRegistry,
    private taskMachine: TaskMachine,
  ) {}

  /** Build a load map from all active (claimed/working) tasks. */
  private buildLoadMap(): Map<string, number> {
    const loadMap = new Map<string, number>();
    for (const task of this.taskMachine.getAll()) {
      if (task.assignee && (task.status === 'working' || task.status === 'claimed')) {
        loadMap.set(task.assignee, (loadMap.get(task.assignee) ?? 0) + 1);
      }
    }
    return loadMap;
  }

  /** Build starvation context for an agent based on lastAssigned and active tasks. */
  private buildStarvationCtx(agentId: string, loadMap: Map<string, number>): StarvationContext {
    return {
      lastAssignedAt: this.lastAssigned.get(agentId),
      hasActiveTasks: (loadMap.get(agentId) ?? 0) > 0,
    };
  }

  /** Get the lastAssigned timestamp for an agent — used by tests for verification. */
  getLastAssigned(agentId: string): string | undefined {
    return this.lastAssigned.get(agentId);
  }

  findBestAgent(requiredCapabilities: string[], task: Task): RegisteredAgent | null {
    const onlineAgents = this.registry.getOnline();
    const loadMap = this.buildLoadMap();

    // Score all online agents, filter out those with total=0 (missing capabilities)
    const scored = onlineAgents
      .map(agent => ({
        agent,
        score: scoreAgent(agent, task, loadMap, this.buildStarvationCtx(agent.agentId, loadMap)),
      }))
      .filter(({ score }) => score.total > 0);

    if (scored.length === 0) return null;

    // Sort by total descending — highest score wins
    scored.sort((a, b) => b.score.total - a.score.total);
    return scored[0].agent;
  }

  autoAssign(task: Task): { task: Task; agent: RegisteredAgent } | null {
    const agent = this.findBestAgent(task.requiredCapabilities, task);
    if (!agent) return null;

    const updatedTask = this.taskMachine.claim(task.id, agent.agentId, task.version);
    // Record assignment time — resets starvation boost
    this.lastAssigned.set(agent.agentId, new Date().toISOString());
    return { task: updatedTask, agent };
  }

  /** Score all capable online agents for a given task — used by diagnostic endpoint. */
  scoreAllAgents(task: Task): RoutingScore[] {
    const onlineAgents = this.registry.getOnline();
    const loadMap = this.buildLoadMap();

    return onlineAgents
      .map(agent => scoreAgent(agent, task, loadMap, this.buildStarvationCtx(agent.agentId, loadMap)))
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total);
  }
}
