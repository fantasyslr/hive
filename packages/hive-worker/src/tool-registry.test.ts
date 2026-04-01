import { describe, expect, it, beforeEach } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import type { ToolDefinition, RegisteredTool } from './types.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('getHiveTools() returns 5 pre-registered Hive tools', () => {
    const tools = registry.getHiveTools();
    expect(tools).toHaveLength(5);
    const names = tools.map(t => t.name);
    expect(names).toContain('memory.search');
    expect(names).toContain('memory.write');
    expect(names).toContain('task.create');
    expect(names).toContain('board.read');
    expect(names).toContain('feishu.send');
    // All should have category 'hive'
    for (const tool of tools) {
      expect(tool.category).toBe('hive');
    }
  });

  it('memory.search has isReadOnly=true, isConcurrencySafe=true; memory.write has isReadOnly=false, isConcurrencySafe=true', () => {
    const tools = registry.getHiveTools();
    const search = tools.find(t => t.name === 'memory.search')!;
    expect(search.isReadOnly).toBe(true);
    expect(search.isConcurrencySafe).toBe(true);

    const write = tools.find(t => t.name === 'memory.write')!;
    expect(write.isReadOnly).toBe(false);
    expect(write.isConcurrencySafe).toBe(true);
  });

  it('registerHarnessTools stores tools; getHarnessTools returns them', () => {
    const tools: ToolDefinition[] = [
      { name: 'bash', description: 'Execute shell', isReadOnly: false, isConcurrencySafe: false },
      { name: 'read', description: 'Read file', isReadOnly: true, isConcurrencySafe: true },
    ];
    registry.registerHarnessTools('claude-main', tools);
    const result = registry.getHarnessTools('claude-main');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('bash');
    expect(result[0].category).toBe('harness');
    expect(result[0].registeredBy).toBe('claude-main');
    expect(result[1].name).toBe('read');
  });

  it('getAll() returns both Hive tools and all registered harness tools', () => {
    registry.registerHarnessTools('claude-main', [
      { name: 'bash', description: 'Execute shell', isReadOnly: false, isConcurrencySafe: false },
    ]);
    registry.registerHarnessTools('codex-1', [
      { name: 'codex.run', description: 'Run codex', isReadOnly: false, isConcurrencySafe: true },
    ]);
    const all = registry.getAll();
    // 5 hive + 1 claude + 1 codex = 7
    expect(all).toHaveLength(7);
  });

  it('getByAgent returns only that agent\'s harness tools', () => {
    registry.registerHarnessTools('claude-main', [
      { name: 'bash', description: 'Execute shell', isReadOnly: false, isConcurrencySafe: false },
    ]);
    registry.registerHarnessTools('codex-1', [
      { name: 'codex.run', description: 'Run codex', isReadOnly: false, isConcurrencySafe: true },
    ]);
    const claudeTools = registry.getByAgent('claude-main');
    expect(claudeTools).toHaveLength(1);
    expect(claudeTools[0].name).toBe('bash');
  });

  it('unregisterAgent removes that agent\'s harness tools', () => {
    registry.registerHarnessTools('claude-main', [
      { name: 'bash', description: 'Execute shell', isReadOnly: false, isConcurrencySafe: false },
    ]);
    expect(registry.getHarnessTools('claude-main')).toHaveLength(1);
    registry.unregisterAgent('claude-main');
    expect(registry.getHarnessTools('claude-main')).toHaveLength(0);
  });

  it('getAll() with category filter "hive" returns only Hive tools', () => {
    registry.registerHarnessTools('claude-main', [
      { name: 'bash', description: 'Execute shell', isReadOnly: false, isConcurrencySafe: false },
    ]);
    const hiveOnly = registry.getAll('hive');
    expect(hiveOnly).toHaveLength(5);
    for (const tool of hiveOnly) {
      expect(tool.category).toBe('hive');
    }
    // Also test harness filter
    const harnessOnly = registry.getAll('harness');
    expect(harnessOnly).toHaveLength(1);
    expect(harnessOnly[0].name).toBe('bash');
  });
});
