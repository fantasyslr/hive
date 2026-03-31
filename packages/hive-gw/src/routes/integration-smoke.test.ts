import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

const TOKEN = 'hive-token-manager';

describe('Integration smoke tests', () => {
  // 1. Health check
  it('GET /health → 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // 2. Auth contract
  it('GET /board without token → 401', async () => {
    const res = await request(app).get('/board');
    expect(res.status).toBe(401);
  });

  it('GET /board with valid token → 200 with agents and tasks', async () => {
    const res = await request(app)
      .get('/board')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(res.body).toHaveProperty('tasks');
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  // 3. Task create → query roundtrip (camelCase verification)
  let createdTaskId: string;

  it('POST /tasks with camelCase body → 201 with camelCase response', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Content-Type', 'application/json')
      .send({
        title: 'Smoke Test Task',
        description: 'Integration smoke test',
        requiredCapabilities: ['test'],
        createdBy: 'smoke-test',
        taskKind: 'execute',
        verificationRequired: true,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Smoke Test Task');
    // Verify camelCase fields present and correct
    expect(res.body.taskKind).toBe('execute');
    expect(res.body.verificationRequired).toBe(true);
    expect(res.body.requiredCapabilities).toEqual(['test']);
    // Verify NO snake_case fields leaked
    expect(res.body).not.toHaveProperty('task_kind');
    expect(res.body).not.toHaveProperty('verification_required');
    expect(res.body).not.toHaveProperty('required_capabilities');
    createdTaskId = res.body.id;
  });

  it('GET /tasks → contains the created task', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    const found = res.body.find((t: any) => t.id === createdTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Smoke Test Task');
  });

  // 4. SSE public endpoint reachable without auth (B1 fix regression guard)
  // SSE connections stay open, so we use supertest .abort() to close after getting headers
  it('GET /events/stream/public without token → NOT 401', () => {
    return new Promise<void>((resolve, reject) => {
      const req = request(app)
        .get('/events/stream/public')
        .buffer(false)
        .parse((res: any) => {
          // We got a response (not 401) — SSE is streaming, abort and pass
          res.on('data', () => {});
          res.on('end', () => {});
        });
      req.expect((res: any) => {
        expect(res.status).not.toBe(401);
      })
      .end((err: any) => {
        if (err) reject(err);
        else resolve();
      });
      // Force close after 1s
      setTimeout(() => { req.abort(); resolve(); }, 1000);
    });
  });
});
