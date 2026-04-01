import { Router } from 'express';
import { z } from 'zod/v4';
import { getTemplate, getAllTemplates } from '../services/template-loader.js';
import { taskMachine } from '../services/task-machine.js';
import { registry } from '../services/registry.js';
import { Dispatcher } from '../services/dispatcher.js';
import { eventBus } from '../services/event-bus.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { validate } from '../middleware/validate.js';
import type { Task, CampaignTemplate } from '@hive/shared';
import type { TaskMachine as TaskMachineType } from '../services/task-machine.js';

const dispatcher = new Dispatcher(registry, taskMachine);

const LaunchTemplateSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(4096).optional(),
});

export const templatesRouter = Router();

// GET /templates — list all templates
templatesRouter.get('/', (_req, res) => {
  res.json(getAllTemplates());
});

// GET /templates/:id — get single template
templatesRouter.get('/:id', (req, res) => {
  const tpl = getTemplate(req.params.id);
  if (!tpl) throw new NotFoundError(`Template ${req.params.id} not found`);
  res.json(tpl);
});

// POST /templates/:id/launch — create parent + sub-tasks from template
templatesRouter.post('/:id/launch', validate(LaunchTemplateSchema), (req, res) => {
  const result = launchTemplate(
    req.params.id,
    {
      userId: req.user!.id,
      name: req.body.name,
      description: req.body.description,
    },
    taskMachine,
    dispatcher,
  );

  if (!result) {
    throw new NotFoundError(`Template ${req.params.id} not found`);
  }

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Emit event for parent task
  eventBus.emit({
    type: 'task.updated',
    data: {
      taskId: result.parent.id,
      templateId: result.templateId,
      subTaskCount: result.subTasks.length,
    },
  });

  // Auto-assign sub-tasks with no dependencies
  for (const sub of result.subTasks) {
    if (!sub.dependsOn || sub.dependsOn.length === 0) {
      const assigned = dispatcher.autoAssign(sub);
      if (assigned) {
        eventBus.emit({
          type: 'task.assigned',
          data: { taskId: assigned.task.id, agentId: assigned.agent.agentId, title: assigned.task.title },
        });
      }
    }
  }

  res.status(201).json({
    parent: result.parent,
    subTasks: result.subTasks,
    templateId: result.templateId,
  });
});

/**
 * Core logic for launching a template — extracted for testability.
 * Returns undefined if template not found.
 */
export function launchTemplate(
  templateId: string,
  opts: { userId: string; name?: string; description?: string },
  tm: TaskMachineType,
  _dispatcher: Dispatcher,
): { parent: Task; subTasks: Task[]; templateId: string } | { error: string } | undefined {
  const template = getTemplate(templateId);
  if (!template) return undefined;

  // --- Validation pass: check for duplicate titles and unresolvable deps ---
  const titleSet = new Set<string>();
  for (const tplTask of template.tasks) {
    if (titleSet.has(tplTask.title)) {
      return { error: `Duplicate task title "${tplTask.title}" in template` };
    }
    titleSet.add(tplTask.title);
  }

  for (const tplTask of template.tasks) {
    for (const depTitle of tplTask.dependsOn) {
      if (!titleSet.has(depTitle)) {
        return { error: `Dependency "${depTitle}" in task "${tplTask.title}" not found in template` };
      }
    }
  }

  // --- Topological sort with cycle detection ---
  const sorted: typeof template.tasks = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const taskByTitle = new Map(template.tasks.map(t => [t.title, t]));

  function visit(title: string, path: string[]): string | null {
    if (visited.has(title)) return null;
    if (visiting.has(title)) return `Cycle detected: ${[...path, title].join(' → ')}`;
    visiting.add(title);
    const task = taskByTitle.get(title)!;
    for (const dep of task.dependsOn) {
      const err = visit(dep, [...path, title]);
      if (err) return err;
    }
    visiting.delete(title);
    visited.add(title);
    sorted.push(task);
    return null;
  }

  for (const task of template.tasks) {
    const cycleErr = visit(task.title, []);
    if (cycleErr) return { error: cycleErr };
  }

  // --- Creation pass: tasks in topological order, all deps resolved ---
  const parent = tm.create({
    title: opts.name || template.name,
    description: opts.description || template.description || '',
    requiredCapabilities: ['orchestration'],
    createdBy: opts.userId,
    taskKind: 'plan',
  });

  // Build title -> task ID map and create sub-tasks in order
  const titleToId = new Map<string, string>();
  const subTasks: Task[] = [];

  for (const tplTask of sorted) {
    // Resolve dependsOn titles to actual task IDs — all deps guaranteed present after topo sort
    const resolvedDeps = tplTask.dependsOn.map(title => titleToId.get(title)!) ;

    const sub = tm.create({
      title: tplTask.title,
      description: tplTask.description || '',
      requiredCapabilities: tplTask.capabilities,
      createdBy: opts.userId,
      parentTaskId: parent.id,
      dependsOn: resolvedDeps,
    });

    titleToId.set(tplTask.title, sub.id);
    subTasks.push(sub);
  }

  return { parent, subTasks, templateId: template.id };
}
