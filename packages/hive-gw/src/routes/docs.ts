import { Router, type Request, type Response } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getOrchestratorPrompt, getPromptLoadedAt } from '../services/prompt-loader.js';

export const docsRouter = Router();

docsRouter.get('/docs/onboarding', async (req: Request, res: Response) => {
  try {
    const filePath = join(process.cwd(), 'docs', 'onboarding.md');
    const content = await readFile(filePath, 'utf-8');

    if (req.accepts('text/markdown')) {
      res.type('text/markdown').send(content);
    } else {
      res.json({ content });
    }
  } catch {
    res.status(500).json({ error: 'Failed to read onboarding document' });
  }
});

docsRouter.get('/docs/orchestrator-prompt', (_req: Request, res: Response) => {
  const content = getOrchestratorPrompt();
  const loadedAt = getPromptLoadedAt();

  if (!content) {
    res.status(503).json({ error: 'Orchestrator prompt not yet loaded' });
    return;
  }

  res.json({ content, loadedAt });
});
