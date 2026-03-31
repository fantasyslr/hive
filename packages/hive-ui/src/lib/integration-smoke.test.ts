// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { fetchBoard, createTask } from './api';

beforeEach(() => {
  mockFetch.mockReset();
});

describe('Integration Smoke: request format matches backend contract', () => {
  describe('fetchBoard request format', () => {
    it('calls /api/board with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [], tasks: [], timestamp: '' }),
      });

      await fetchBoard();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/board');
      expect(init.headers['Authorization']).toMatch(/^Bearer .+/);
      expect(init.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('createTask request format', () => {
    it('sends camelCase fields (not snake_case)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 't1', title: 'Test', status: 'pending' }),
      });

      await createTask({
        title: 'Test',
        requiredCapabilities: ['code'],
        createdBy: 'user',
        taskKind: 'execute',
        verificationRequired: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      // camelCase present
      expect(body.taskKind).toBe('execute');
      expect(body.verificationRequired).toBe(true);
      expect(body.requiredCapabilities).toEqual(['code']);

      // snake_case absent
      expect(body).not.toHaveProperty('task_kind');
      expect(body).not.toHaveProperty('verification_required');
      expect(body).not.toHaveProperty('required_capabilities');
    });
  });

  describe('response parsing', () => {
    it('fetchBoard returns camelCase fields from backend response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: [{
            agentId: 'a1', name: 'Agent1', status: 'online',
            capabilities: ['code'], interests: [], endpoint: 'http://localhost:9999',
            registeredAt: '2026-03-31T00:00:00Z', lastSeenAt: '2026-03-31T00:00:00Z',
          }],
          tasks: [{
            id: 't1', title: 'Task1', description: '', requiredCapabilities: ['code'],
            status: 'pending', assignee: null, createdBy: 'user', result: null, error: null,
            version: 1, createdAt: '2026-03-31T00:00:00Z', updatedAt: '2026-03-31T00:00:00Z',
            taskKind: 'execute', verificationRequired: false, parentTaskId: null,
          }],
          timestamp: '2026-03-31T00:00:00Z',
        }),
      });

      const board = await fetchBoard();

      expect(board.tasks[0]).toHaveProperty('taskKind', 'execute');
      expect(board.tasks[0]).not.toHaveProperty('task_kind');
      expect(board.agents[0]).toHaveProperty('agentId', 'a1');
      expect(board.agents[0]).not.toHaveProperty('agent_id');
    });
  });
});
