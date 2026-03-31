import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTemplateWatcher, stopTemplateWatcher } from '../services/template-loader.js';
import { TaskMachine } from '../services/task-machine.js';
import { AgentRegistry } from '../services/registry.js';
import { Dispatcher } from '../services/dispatcher.js';
import { launchTemplate } from './templates.js';

const CAMPAIGN_TEMPLATE = {
  id: 'campaign',
  name: 'Market Campaign',
  description: 'Standard campaign workflow: research -> strategy + creative -> review',
  tasks: [
    {
      title: 'Market Research',
      role: 'operations',
      capabilities: ['research'],
      dependsOn: [],
      description: 'Analyze target market, competitors, and audience insights',
    },
    {
      title: 'Ad Strategy',
      role: 'ad_buyer',
      capabilities: ['planning'],
      dependsOn: ['Market Research'],
      description: 'Define ad channels, budget allocation, and targeting strategy',
    },
    {
      title: 'Creative Assets',
      role: 'creative',
      capabilities: ['design'],
      dependsOn: ['Market Research'],
      description: 'Produce visual and copy assets for the campaign',
    },
    {
      title: 'Manager Review',
      role: 'manager',
      capabilities: ['review'],
      dependsOn: ['Ad Strategy', 'Creative Assets'],
      description: 'Review all deliverables and approve for launch',
    },
  ],
};

describe('Template routes', () => {
  let tmpDir: string;
  let tm: TaskMachine;
  let registry: AgentRegistry;
  let dispatcher: Dispatcher;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hive-tpl-'));
    await writeFile(join(tmpDir, 'campaign.json'), JSON.stringify(CAMPAIGN_TEMPLATE));
    await startTemplateWatcher(tmpDir);
    tm = new TaskMachine();
    registry = new AgentRegistry();
    dispatcher = new Dispatcher(registry, tm);
  });

  afterEach(async () => {
    stopTemplateWatcher();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('GET /templates (getAllTemplates)', () => {
    it('returns array of all templates', async () => {
      const { getAllTemplates } = await import('../services/template-loader.js');
      const all = getAllTemplates();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('campaign');
    });
  });

  describe('GET /templates/:id (getTemplate)', () => {
    it('returns the campaign template', async () => {
      const { getTemplate } = await import('../services/template-loader.js');
      const tpl = getTemplate('campaign');
      expect(tpl).toBeDefined();
      expect(tpl!.id).toBe('campaign');
      expect(tpl!.tasks).toHaveLength(4);
    });

    it('returns undefined for nonexistent template', async () => {
      const { getTemplate } = await import('../services/template-loader.js');
      const tpl = getTemplate('nonexistent');
      expect(tpl).toBeUndefined();
    });
  });

  describe('POST /templates/:id/launch (launchTemplate)', () => {
    it('creates parent task + 4 sub-tasks', () => {
      const result = launchTemplate('campaign', { userId: 'manager' }, tm, dispatcher);
      expect(result).toBeDefined();
      expect(result!.parent).toBeDefined();
      expect(result!.subTasks).toHaveLength(4);
      expect(result!.templateId).toBe('campaign');
    });

    it('sub-tasks have parentTaskId equal to parent task id', () => {
      const result = launchTemplate('campaign', { userId: 'manager' }, tm, dispatcher);
      for (const sub of result!.subTasks) {
        expect(sub.parentTaskId).toBe(result!.parent.id);
      }
    });

    it('sub-tasks with dependsOn have resolved task IDs (not titles)', () => {
      const result = launchTemplate('campaign', { userId: 'manager' }, tm, dispatcher);
      // "Ad Strategy" depends on "Market Research" — dependsOn should contain the Market Research task ID
      const adStrategy = result!.subTasks.find(t => t.title === 'Ad Strategy')!;
      const marketResearch = result!.subTasks.find(t => t.title === 'Market Research')!;
      expect(adStrategy.dependsOn).toBeDefined();
      expect(adStrategy.dependsOn).toContain(marketResearch.id);
      // IDs should be nanoid-style, not title strings
      for (const depId of adStrategy.dependsOn!) {
        expect(depId).not.toBe('Market Research');
      }
    });

    it('"Market Research" sub-task (no deps) has empty dependsOn array', () => {
      const result = launchTemplate('campaign', { userId: 'manager' }, tm, dispatcher);
      const marketResearch = result!.subTasks.find(t => t.title === 'Market Research')!;
      expect(marketResearch.dependsOn).toEqual([]);
    });

    it('"Manager Review" sub-task depends on "Ad Strategy" and "Creative Assets" task IDs', () => {
      const result = launchTemplate('campaign', { userId: 'manager' }, tm, dispatcher);
      const managerReview = result!.subTasks.find(t => t.title === 'Manager Review')!;
      const adStrategy = result!.subTasks.find(t => t.title === 'Ad Strategy')!;
      const creativeAssets = result!.subTasks.find(t => t.title === 'Creative Assets')!;
      expect(managerReview.dependsOn).toContain(adStrategy.id);
      expect(managerReview.dependsOn).toContain(creativeAssets.id);
      expect(managerReview.dependsOn).toHaveLength(2);
    });

    it('returns undefined for nonexistent template', () => {
      const result = launchTemplate('nonexistent', { userId: 'manager' }, tm, dispatcher);
      expect(result).toBeUndefined();
    });

    it('parent task has taskKind "plan" and orchestration capability', () => {
      const result = launchTemplate('campaign', { userId: 'manager' }, tm, dispatcher);
      expect(result!.parent.taskKind).toBe('plan');
      expect(result!.parent.requiredCapabilities).toContain('orchestration');
    });
  });
});
