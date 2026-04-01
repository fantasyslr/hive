import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTemplateWatcher, stopTemplateWatcher, getTemplate, getAllTemplates } from './template-loader.js';

describe('template-loader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hive-tpl-'));
  });

  afterEach(async () => {
    stopTemplateWatcher();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('getAllTemplates returns parsed templates from disk', async () => {
    const tpl = {
      id: 'test-tpl',
      name: 'Test Template',
      tasks: [{ title: 'Task A', role: 'ops', capabilities: ['research'], dependsOn: [] }],
    };
    await writeFile(join(tmpDir, 'test-tpl.json'), JSON.stringify(tpl));
    await startTemplateWatcher(tmpDir);

    const all = getAllTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('test-tpl');
  });

  it('getTemplate("campaign") returns the campaign template with 4 tasks', async () => {
    const tpl = {
      id: 'campaign',
      name: 'Market Campaign',
      tasks: [
        { title: 'Market Research', role: 'operations', capabilities: ['research'], dependsOn: [] },
        { title: 'Ad Strategy', role: 'ad_buyer', capabilities: ['planning'], dependsOn: ['Market Research'] },
        { title: 'Creative Assets', role: 'creative', capabilities: ['design'], dependsOn: ['Market Research'] },
        { title: 'Manager Review', role: 'manager', capabilities: ['review'], dependsOn: ['Ad Strategy', 'Creative Assets'] },
      ],
    };
    await writeFile(join(tmpDir, 'campaign.json'), JSON.stringify(tpl));
    await startTemplateWatcher(tmpDir);

    const result = getTemplate('campaign');
    expect(result).toBeDefined();
    expect(result!.tasks).toHaveLength(4);
    expect(result!.name).toBe('Market Campaign');
  });

  it('getTemplate("nonexistent") returns undefined', async () => {
    await startTemplateWatcher(tmpDir);
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('startTemplateWatcher does not throw when directory does not exist', async () => {
    const missingDir = join(tmpdir(), 'nonexistent-hive-tpl-' + Date.now());
    // Should not throw — gracefully skip
    await expect(startTemplateWatcher(missingDir)).resolves.not.toThrow();
  });

  it('getAllTemplates returns empty array after starting with missing directory', async () => {
    stopTemplateWatcher(); // clear any prior state
    const missingDir = join(tmpdir(), 'nonexistent-hive-tpl-' + Date.now());
    await startTemplateWatcher(missingDir);
    expect(getAllTemplates()).toEqual([]);
  });

  it('template tasks have required fields: title, role, capabilities, dependsOn', async () => {
    const tpl = {
      id: 'fields-check',
      name: 'Fields Check',
      tasks: [
        { title: 'Do Thing', role: 'ops', capabilities: ['cap1'], dependsOn: ['Other'] },
      ],
    };
    await writeFile(join(tmpDir, 'fields-check.json'), JSON.stringify(tpl));
    await startTemplateWatcher(tmpDir);

    const result = getTemplate('fields-check');
    expect(result).toBeDefined();
    const task = result!.tasks[0];
    expect(task).toHaveProperty('title', 'Do Thing');
    expect(task).toHaveProperty('role', 'ops');
    expect(task).toHaveProperty('capabilities');
    expect(task.capabilities).toEqual(['cap1']);
    expect(task).toHaveProperty('dependsOn');
    expect(task.dependsOn).toEqual(['Other']);
  });
});
