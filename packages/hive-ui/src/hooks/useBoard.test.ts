// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBoard } from './useBoard';

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Ensure localStorage is available (jsdom provides it but getToken needs it)
if (!global.localStorage) {
  const store: Record<string, string> = {};
  Object.defineProperty(global, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
    },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('useBoard', () => {
  it('loads board data on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: [{ agentId: 'a1', name: 'Agent1', status: 'online', capabilities: [], interests: [], endpoint: '', registeredAt: '', lastSeenAt: '' }],
        tasks: [{ id: 't1', title: 'Task1', status: 'pending', description: '', requiredCapabilities: [], assignee: null, createdBy: 'user', result: null, error: null, version: 1, createdAt: '', updatedAt: '' }],
        timestamp: '2026-03-31T00:00:00Z',
      }),
    });

    const { result } = renderHook(() => useBoard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.agents).toHaveLength(1);
    expect(result.current.tasks).toHaveLength(1);
  });

  it('sets error on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server Error',
    });

    const { result } = renderHook(() => useBoard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.agents).toHaveLength(0);
  });

  it('refresh re-fetches data', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [], tasks: [], timestamp: '' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: [],
          tasks: [{ id: 't2', title: 'New', status: 'done', description: '', requiredCapabilities: [], assignee: null, createdBy: 'user', result: null, error: null, version: 1, createdAt: '', updatedAt: '' }],
          timestamp: '',
        }),
      });

    const { result } = renderHook(() => useBoard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tasks).toHaveLength(0);

    await result.current.refresh();
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
