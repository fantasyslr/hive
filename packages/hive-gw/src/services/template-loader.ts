import { readdir, readFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { CampaignTemplate } from '@hive/shared';
import { logger } from '../config.js';

const templates = new Map<string, CampaignTemplate>();
let watcher: FSWatcher | null = null;

async function loadTemplates(dirPath: string): Promise<void> {
  try {
    const files = await readdir(dirPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const newTemplates = new Map<string, CampaignTemplate>();
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(dirPath, file), 'utf-8');
        const tpl: CampaignTemplate = JSON.parse(raw);
        if (tpl.id) {
          newTemplates.set(tpl.id, tpl);
        }
      } catch (err) {
        logger.error({ err, file }, 'Failed to parse template file');
      }
    }

    templates.clear();
    for (const [id, tpl] of newTemplates) {
      templates.set(id, tpl);
    }

    logger.info({ count: templates.size }, 'Templates loaded');
  } catch (err) {
    logger.error({ err, dirPath }, 'Failed to load templates directory');
  }
}

export function getTemplate(id: string): CampaignTemplate | undefined {
  return templates.get(id);
}

export function getAllTemplates(): CampaignTemplate[] {
  return Array.from(templates.values());
}

export async function startTemplateWatcher(dirPath: string): Promise<void> {
  await loadTemplates(dirPath);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watcher = watch(dirPath, (_eventType, _filename) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await loadTemplates(dirPath);
      logger.info('Templates hot-reloaded');
    }, 500);
  });

  logger.info({ dirPath }, 'Template directory watcher started');
}

export function stopTemplateWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  templates.clear();
}
