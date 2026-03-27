/**
 * Memory search route.
 *
 * KNOWN DESIGN LIMITATION (MEM-02): Namespace isolation is convention-based
 * (path prefixes like `public/*`, `agent/{id}/*`), NOT enforced by Nowledge Mem
 * access control. Any caller who knows the path convention can read/write any
 * namespace. Acceptable for the current trust model (all agents are internal)
 * but should be revisited if external agents are ever introduced.
 */
import { Router } from 'express';
import { MemorySearchSchema } from '@hive/shared';
import type { MemoryService } from '../services/memory-service.js';

export function createMemoryRouter(memoryService: MemoryService): Router {
  const router = Router();

  router.get('/search', async (req, res) => {
    if (!memoryService.isReady()) {
      res.status(503).json({ error: 'Memory service unavailable' });
      return;
    }

    const parsed = MemorySearchSchema.safeParse({
      query: req.query.query,
      namespace: req.query.namespace,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { query, namespace, limit } = parsed.data;
    const results = await memoryService.search(query, namespace, limit);
    res.json({ results });
  });

  return router;
}
