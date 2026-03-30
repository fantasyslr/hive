/**
 * Memory search route.
 *
 * NAMESPACE ISOLATION STATUS: Convention-based (soft constraint).
 * - The `namespace` query parameter is prepended to the search query as a
 *   prefix hint (e.g., `public/conclusions auth refactor`).
 * - The configured memory backend does NOT enforce access control per namespace.
 * - Any agent can search any namespace if they know the path convention.
 * - This is acceptable for the current trust model (all agents are internal).
 * - This is NOT a security boundary — do not rely on it for access control.
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
