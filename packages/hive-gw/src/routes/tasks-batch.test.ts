import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { taskMachine } from '../services/task-machine.js';

const TOKEN = 'hive-token-manager';

describe('POST /tasks/batch', () => {
  beforeEach(() => {
    taskMachine.clear();
  });

  it('creates multiple sub-tasks with correct parentTaskId and runId', async () => {
    // Create parent task first
    const parent = taskMachine.create({
      title: 'Coordinator task',
      description: 'Parent',
      requiredCapabilities: ['coordination'],
      createdBy: 'human',
      taskKind: 'coordinate',
    });

    const res = await request(app)
      .post('/tasks/batch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        parentTaskId: parent.id,
        tasks: [
          {
            title: 'Research phase',
            description: 'Do research',
            requiredCapabilities: ['research'],
            taskKind: 'execute',
          },
          {
            title: 'Write report',
            description: 'Write it up',
            requiredCapabilities: ['writing'],
            taskKind: 'execute',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].parentTaskId).toBe(parent.id);
    expect(res.body[1].parentTaskId).toBe(parent.id);
    // All sub-tasks share a runId
    expect(res.body[0].runId).toBeTruthy();
    expect(res.body[0].runId).toBe(res.body[1].runId);
  });

  it('resolves dependsOn title strings to task IDs', async () => {
    const parent = taskMachine.create({
      title: 'Coordinator',
      description: '',
      requiredCapabilities: ['coordination'],
      createdBy: 'human',
    });

    const res = await request(app)
      .post('/tasks/batch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        parentTaskId: parent.id,
        tasks: [
          {
            title: 'Step A',
            requiredCapabilities: ['research'],
          },
          {
            title: 'Step B',
            requiredCapabilities: ['writing'],
            dependsOn: ['Step A'],
          },
        ],
      });

    expect(res.status).toBe(201);
    const stepA = res.body.find((t: any) => t.title === 'Step A');
    const stepB = res.body.find((t: any) => t.title === 'Step B');
    expect(stepB.dependsOn).toEqual([stepA.id]);
  });

  it('returns 400 when parentTaskId does not exist', async () => {
    const res = await request(app)
      .post('/tasks/batch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        parentTaskId: 'nonexistent-id',
        tasks: [
          {
            title: 'Task A',
            requiredCapabilities: ['research'],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parent/i);
  });

  it('returns 400 when dependsOn references unknown title', async () => {
    const parent = taskMachine.create({
      title: 'Coordinator',
      description: '',
      requiredCapabilities: ['coordination'],
      createdBy: 'human',
    });

    const res = await request(app)
      .post('/tasks/batch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        parentTaskId: parent.id,
        tasks: [
          {
            title: 'Step A',
            requiredCapabilities: ['research'],
          },
          {
            title: 'Step B',
            requiredCapabilities: ['writing'],
            dependsOn: ['Nonexistent Step'],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/depend/i);
  });

  it('batch creation is atomic — cleans up on dependency resolution failure', async () => {
    const parent = taskMachine.create({
      title: 'Coordinator',
      description: '',
      requiredCapabilities: ['coordination'],
      createdBy: 'human',
    });

    const beforeCount = taskMachine.getAll().length;

    await request(app)
      .post('/tasks/batch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        parentTaskId: parent.id,
        tasks: [
          {
            title: 'Step A',
            requiredCapabilities: ['research'],
          },
          {
            title: 'Step B',
            requiredCapabilities: ['writing'],
            dependsOn: ['Ghost Task'],
          },
        ],
      });

    // No new tasks should remain after failed batch
    expect(taskMachine.getAll().length).toBe(beforeCount);
  });
});
