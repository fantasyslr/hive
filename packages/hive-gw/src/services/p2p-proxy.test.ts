import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardP2PRequest, type ForwardRequest } from './p2p-proxy.js';

describe('forwardP2PRequest', () => {
  const baseReq: ForwardRequest = {
    from_agent_id: 'agent-a',
    to_agent_id: 'agent-b',
    endpoint: 'http://localhost:4001',
    payload: { action: 'summarize', data: 'some content' },
    timeout_ms: 5000,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns delivered status when target responds 200', async () => {
    const mockResponse = { result: 'summary complete' };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await forwardP2PRequest(baseReq);

    expect(result.status).toBe('delivered');
    expect(result.from_agent_id).toBe('agent-a');
    expect(result.to_agent_id).toBe('agent-b');
    expect(result.response).toEqual(mockResponse);
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('sends POST to {endpoint}/p2p with correct body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await forwardP2PRequest(baseReq);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4001/p2p',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_agent_id: 'agent-a',
          payload: { action: 'summarize', data: 'some content' },
        }),
      }),
    );
  });

  it('strips trailing slash from endpoint before appending /p2p', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await forwardP2PRequest({ ...baseReq, endpoint: 'http://localhost:4001/' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4001/p2p',
      expect.anything(),
    );
  });

  it('returns error status when target responds with non-200', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'busy' }),
    });

    const result = await forwardP2PRequest(baseReq);

    expect(result.status).toBe('error');
    expect(result.error).toContain('503');
    expect(result.response).toBeUndefined();
  });

  it('returns error status when fetch throws (network error)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await forwardP2PRequest(baseReq);

    expect(result.status).toBe('error');
    expect(result.error).toBe('fetch failed');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns timeout error when request exceeds timeout_ms', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);

    const result = await forwardP2PRequest({ ...baseReq, timeout_ms: 100 });

    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(result.error).toContain('agent-b');
  });

  it('measures latency in milliseconds', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const result = await forwardP2PRequest(baseReq);

    expect(result.latency_ms).toBeGreaterThanOrEqual(40); // allow small timing variance
    expect(result.latency_ms).toBeLessThan(5000);
  });
});
