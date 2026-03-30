/**
 * Memory search route.
 *
 * NAMESPACE ISOLATION STATUS: Convention-based (soft constraint).
 * - The `namespace` query parameter is passed as a filter to the memory backend.
 * - Legacy aliases "public" / "agent" are resolved by MemoryService.
 * - The configured memory backend does NOT enforce access control per namespace.
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
      namespace: req.query.namespace || undefined,
      agentId: req.query.agentId || undefined,
      after: req.query.after || undefined,
      before: req.query.before || undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { query, namespace, agentId, after, before, limit } = parsed.data;
    const results = await memoryService.search(query, { namespace, agentId, after, before, limit });
    res.json({ results });
  });

  return router;
}
