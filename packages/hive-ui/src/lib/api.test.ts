import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const store: Record<string, string> = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
  },
});

import { fetchBoard, createTask } from './api';

beforeEach(() => {
  mockFetch.mockReset();
  Object.keys(store).forEach(k => delete store[k]);
});

describe('api', () => {
  describe('F1: CreateTaskPayload uses camelCase', () => {
    it('sends taskKind and verificationRequired (not snake_case)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', title: 'test', status: 'pending' }),
      });

      await createTask({
        title: 'test',
        createdBy: 'web-ui',
        taskKind: 'execute',
        verificationRequired: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.taskKind).toBe('execute');
      expect(body.verificationRequired).toBe(true);
      expect(body).not.toHaveProperty('task_kind');
      expect(body).not.toHaveProperty('verification_required');
    });
  });

  describe('F2: Auth header', () => {
    it('fetchBoard sends Authorization Bearer header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [], tasks: [], timestamp: '' }),
      });

      await fetchBoard();

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toMatch(/^Bearer .+/);
    });

    it('createTask sends Authorization Bearer header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', title: 'test', status: 'pending' }),
      });

      await createTask({ title: 'test', createdBy: 'web-ui' });

      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toMatch(/^Bearer .+/);
    });
  });
});
