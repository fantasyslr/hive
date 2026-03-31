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
): { parent: Task; subTasks: Task[]; templateId: string } | undefined {
  const template = getTemplate(templateId);
  if (!template) return undefined;

  // Create parent task
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

  for (const tplTask of template.tasks) {
    // Resolve dependsOn titles to actual task IDs
    const resolvedDeps = tplTask.dependsOn
      .map(title => titleToId.get(title))
      .filter((id): id is string => id !== undefined);

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
