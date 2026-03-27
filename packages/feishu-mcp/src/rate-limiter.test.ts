import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, FEISHU_RATE_TIERS } from './rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when bucket has tokens', async () => {
    const limiter = new RateLimiter({ capacity: 5, refillRate: 1, refillIntervalMs: 1000 });
    // Should resolve without waiting
    await limiter.acquire();
    limiter.dispose();
  });

  it('depletes tokens and waits for refill', async () => {
    const limiter = new RateLimiter({ capacity: 2, refillRate: 1, refillIntervalMs: 1000 });

    // Drain bucket
    await limiter.acquire();
    await limiter.acquire();

    // Third acquire should be queued
    let resolved = false;
    const p = limiter.acquire().then(() => { resolved = true; });

    // Not resolved yet
    expect(resolved).toBe(false);

    // Advance time to trigger refill
    vi.advanceTimersByTime(1000);
    await p;

    expect(resolved).toBe(true);
    limiter.dispose();
  });

  it('queues concurrent acquire() calls in FIFO order', async () => {
    const limiter = new RateLimiter({ capacity: 1, refillRate: 1, refillIntervalMs: 1000 });

    // Drain
    await limiter.acquire();

    const order: number[] = [];
    const p1 = limiter.acquire().then(() => { order.push(1); });
    const p2 = limiter.acquire().then(() => { order.push(2); });

    // First refill — serves p1
    vi.advanceTimersByTime(1000);
    await p1;

    // Second refill — serves p2
    vi.advanceTimersByTime(1000);
    await p2;

    expect(order).toEqual([1, 2]);
    limiter.dispose();
  });

  it('reset() refills bucket to max capacity', async () => {
    const limiter = new RateLimiter({ capacity: 3, refillRate: 1, refillIntervalMs: 1000 });

    // Drain all
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // Reset refills
    limiter.reset();

    // Should resolve immediately for 3 more
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    limiter.dispose();
  });
});

describe('FEISHU_RATE_TIERS', () => {
  it('has bitable, docs, and default tiers', () => {
    expect(FEISHU_RATE_TIERS.bitable).toBeDefined();
    expect(FEISHU_RATE_TIERS.docs).toBeDefined();
    expect(FEISHU_RATE_TIERS.default).toBeDefined();
  });
});
