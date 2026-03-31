import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

/**
 * B1 + B3: Auth route matrix — validates public vs protected routes.
 *
 * Uses a lightweight Express app that mirrors index.ts route ordering
 * to test auth middleware placement without SSE hanging issues.
 */

const VALID_TOKEN = 'hive-token-manager';

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Public routes (before auth) — mirrors index.ts
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/events/stream/public', (_req, res) => { res.json({ stream: 'public' }); });

  // Auth middleware
  app.use(authMiddleware);

  // Protected routes (after auth)
  app.get('/board', (_req, res) => { res.json({ agents: [], tasks: [] }); });
  app.get('/tasks', (_req, res) => { res.json([]); });
  app.post('/tasks', (_req, res) => { res.status(201).json({ id: 'test' }); });
  app.get('/templates', (_req, res) => { res.json([]); });
  app.get('/memory/search', (_req, res) => { res.json([]); });
  app.get('/events/stream', (_req, res) => { res.json({ stream: 'agent' }); });

  return app;
}

describe('Auth route matrix', () => {
  const app = buildTestApp();

  const PUBLIC_ROUTES = [
    { method: 'get' as const, path: '/health' },
    { method: 'get' as const, path: '/events/stream/public' },
  ];

  const PROTECTED_ROUTES = [
    { method: 'get' as const, path: '/board' },
    { method: 'get' as const, path: '/tasks' },
    { method: 'post' as const, path: '/tasks', body: { title: 'test' } },
    { method: 'get' as const, path: '/templates' },
    { method: 'get' as const, path: '/memory/search?query=test' },
    { method: 'get' as const, path: '/events/stream?agentId=test' },
  ];

  describe('PUBLIC routes — no token required', () => {
    for (const route of PUBLIC_ROUTES) {
      it(`${route.method.toUpperCase()} ${route.path} without token → NOT 401`, async () => {
        const res = await request(app)[route.method](route.path);
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe('PROTECTED routes — token required', () => {
    for (const route of PROTECTED_ROUTES) {
      it(`${route.method.toUpperCase()} ${route.path} without token → 401`, async () => {
        const req = request(app)[route.method](route.path);
        if ('body' in route && route.body) req.send(route.body);
        const res = await req;
        expect(res.status).toBe(401);
      });

      it(`${route.method.toUpperCase()} ${route.path} with valid token → NOT 401`, async () => {
        const req = request(app)[route.method](route.path)
          .set('Authorization', `Bearer ${VALID_TOKEN}`);
        if ('body' in route && route.body) req.send(route.body).set('Content-Type', 'application/json');
        const res = await req;
        expect(res.status).not.toBe(401);
      });
    }
  });
});
