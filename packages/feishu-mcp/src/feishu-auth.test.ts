import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FeishuAuth } from './feishu-auth.js';

describe('FeishuAuth', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mockTokenResponse(token: string, expire: number) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant_access_token: token, expire, code: 0, msg: 'ok' }),
    });
  }

  it('fetches new token on first call', async () => {
    mockTokenResponse('token-abc', 7200);
    const auth = new FeishuAuth({ appId: 'id1', appSecret: 'secret1' });
    const token = await auth.getToken();
    expect(token).toBe('token-abc');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ app_id: 'id1', app_secret: 'secret1' }),
      }),
    );
  });

  it('returns cached token on subsequent calls within validity', async () => {
    mockTokenResponse('token-cached', 7200);
    const auth = new FeishuAuth({ appId: 'id1', appSecret: 'secret1' });
    const t1 = await auth.getToken();
    const t2 = await auth.getToken();
    expect(t1).toBe('token-cached');
    expect(t2).toBe('token-cached');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes token when within 5 minutes of expiry', async () => {
    mockTokenResponse('token-old', 7200);
    const auth = new FeishuAuth({ appId: 'id1', appSecret: 'secret1' });
    await auth.getToken();

    // Advance to 5 minutes before expiry (7200s - 300s = 6900s)
    vi.advanceTimersByTime(6901 * 1000);

    mockTokenResponse('token-new', 7200);
    const token = await auth.getToken();
    expect(token).toBe('token-new');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on auth failure with descriptive error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 10003, msg: 'app_id or app_secret is invalid', tenant_access_token: '', expire: 0 }),
    });
    const auth = new FeishuAuth({ appId: 'bad', appSecret: 'bad' });
    await expect(auth.getToken()).rejects.toThrow('Feishu auth failed');
  });
});
