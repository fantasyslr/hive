import type { ToolDefinition, RegisteredTool, ToolCategory } from './types.js';

/** Pre-registered Hive tools per D-05 */
const HIVE_TOOLS: RegisteredTool[] = [
  {
    name: 'memory.search',
    description: 'Search team memory for relevant knowledge',
    isReadOnly: true,
    isConcurrencySafe: true,
    category: 'hive',
  },
  {
    name: 'memory.write',
    description: 'Write a new entry to team memory',
    isReadOnly: false,
    isConcurrencySafe: true,
    category: 'hive',
  },
  {
    name: 'task.create',
    description: 'Create a new task on the board',
    isReadOnly: false,
    isConcurrencySafe: true,
    category: 'hive',
  },
  {
    name: 'board.read',
    description: 'Read the current board snapshot (agents + tasks)',
    isReadOnly: true,
    isConcurrencySafe: true,
    category: 'hive',
  },
  {
    name: 'feishu.send',
    description: 'Send a message via Feishu webhook',
    isReadOnly: false,
    isConcurrencySafe: true,
    category: 'hive',
  },
];

export class ToolRegistry {
  private harnessTools = new Map<string, RegisteredTool[]>();

  /** Get all pre-registered Hive tools */
  getHiveTools(): RegisteredTool[] {
    return [...HIVE_TOOLS];
  }

  /** Register harness-native tools declared by an adapter */
  registerHarnessTools(agentId: string, tools: ToolDefinition[]): void {
    const registered: RegisteredTool[] = tools.map(t => ({
      ...t,
      category: 'harness' as ToolCategory,
      registeredBy: agentId,
    }));
    this.harnessTools.set(agentId, registered);
  }

  /** Get harness tools for a specific agent */
  getHarnessTools(agentId: string): RegisteredTool[] {
    return this.harnessTools.get(agentId) ?? [];
  }

  /** Get tools by a specific agent (harness tools only) */
  getByAgent(agentId: string): RegisteredTool[] {
    return this.getHarnessTools(agentId);
  }

  /** Remove an agent's harness tools */
  unregisterAgent(agentId: string): void {
    this.harnessTools.delete(agentId);
  }

  /** Get all tools, optionally filtered by category */
  getAll(category?: ToolCategory): RegisteredTool[] {
    if (category === 'hive') return this.getHiveTools();
    if (category === 'harness') {
      return Array.from(this.harnessTools.values()).flat();
    }
    return [
      ...this.getHiveTools(),
      ...Array.from(this.harnessTools.values()).flat(),
    ];
  }
}
