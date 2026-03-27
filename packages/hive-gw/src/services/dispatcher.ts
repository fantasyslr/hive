import type { RegisteredAgent, Task } from '@hive/shared';
import type { AgentRegistry } from './registry.js';
import type { TaskMachine } from './task-machine.js';

export class Dispatcher {
  constructor(
    private registry: AgentRegistry,
    private taskMachine: TaskMachine,
  ) {}

  findBestAgent(requiredCapabilities: string[]): RegisteredAgent | null {
    const onlineAgents = this.registry.getOnline();

    const capable = onlineAgents.filter(agent =>
      requiredCapabilities.every(cap => agent.capabilities.includes(cap)),
    );

    if (capable.length === 0) return null;

    // Pick least-loaded agent (fewest 'working' or 'claimed' tasks)
    const allTasks = this.taskMachine.getAll();
    const loadMap = new Map<string, number>();
    for (const task of allTasks) {
      if (task.assignee && (task.status === 'working' || task.status === 'claimed')) {
        loadMap.set(task.assignee, (loadMap.get(task.assignee) || 0) + 1);
      }
    }

    capable.sort((a, b) => (loadMap.get(a.agent_id) || 0) - (loadMap.get(b.agent_id) || 0));
    return capable[0];
  }

  autoAssign(task: Task): { task: Task; agent: RegisteredAgent } | null {
    const agent = this.findBestAgent(task.requiredCapabilities);
    if (!agent) return null;

    const updatedTask = this.taskMachine.claim(task.id, agent.agent_id, task.version);
    return { task: updatedTask, agent };
  }
}
