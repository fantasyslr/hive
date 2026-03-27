import type { FeishuAuth } from './feishu-auth.js';
import type { RateLimiter } from './rate-limiter.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

export class FeishuApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly msg: string,
    public readonly path: string,
  ) {
    super(`Feishu API error on ${path}: [${code}] ${msg}`);
    this.name = 'FeishuApiError';
  }
}

export interface FeishuClientConfig {
  auth: FeishuAuth;
  rateLimiter: RateLimiter;
}

export class FeishuClient {
  private readonly auth: FeishuAuth;
  private readonly rateLimiter: RateLimiter;

  constructor(config: FeishuClientConfig) {
    this.auth = config.auth;
    this.rateLimiter = config.rateLimiter;
  }

  async get(path: string, params?: Record<string, string | number | undefined>): Promise<unknown> {
    await this.rateLimiter.acquire();
    const token = await this.auth.getToken();
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const res = await this.fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return this.parseResponse(res, path);
  }

  async post(path: string, body: unknown): Promise<unknown> {
    await this.rateLimiter.acquire();
    const token = await this.auth.getToken();

    const res = await this.fetchWithRetry(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return this.parseResponse(res, path);
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const res = await fetch(url, init);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 1;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      // Retry once
      return fetch(url, init);
    }

    return res;
  }

  private async parseResponse(res: Response, path: string): Promise<unknown> {
    const data = await res.json() as { code?: number; msg?: string; data?: unknown };

    if (data.code && data.code !== 0) {
      throw new FeishuApiError(data.code, data.msg ?? 'Unknown error', path);
    }

    return data.data;
  }
}
