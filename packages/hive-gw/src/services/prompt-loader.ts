import { readFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { logger } from '../config.js';

let orchestratorPrompt = '';
let promptLoadedAt = '';
let watcher: FSWatcher | null = null;

async function loadPrompt(filePath: string): Promise<void> {
  try {
    orchestratorPrompt = await readFile(filePath, 'utf-8');
    promptLoadedAt = new Date().toISOString();
    logger.info({ filePath, length: orchestratorPrompt.length }, 'Orchestrator prompt loaded');
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to load orchestrator prompt');
  }
}

export function getOrchestratorPrompt(): string {
  return orchestratorPrompt;
}

export function getPromptLoadedAt(): string {
  return promptLoadedAt;
}

export async function startPromptWatcher(filePath: string): Promise<void> {
  await loadPrompt(filePath);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watcher = watch(filePath, (eventType) => {
    if (eventType !== 'change') return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await loadPrompt(filePath);
      logger.info('Orchestrator prompt hot-reloaded');
    }, 500);
  });

  logger.info({ filePath }, 'Prompt file watcher started');
}

export function stopPromptWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
