export interface RateLimiterConfig {
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
}

interface QueueEntry {
  resolve: () => void;
  cost: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly queue: QueueEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this.capacity = config.capacity;
    this.tokens = config.capacity;
    this.refillRate = config.refillRate;

    this.timer = setInterval(() => {
      this.refill();
    }, config.refillIntervalMs);
  }

  async acquire(cost = 1): Promise<void> {
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push({ resolve, cost });
    });
  }

  reset(): void {
    this.tokens = this.capacity;
    this.drainQueue();
  }

  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private refill(): void {
    this.tokens = Math.min(this.capacity, this.tokens + this.refillRate);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.tokens >= this.queue[0].cost) {
      const entry = this.queue.shift()!;
      this.tokens -= entry.cost;
      entry.resolve();
    }
  }
}

export const FEISHU_RATE_TIERS = {
  bitable: { capacity: 20, refillRate: 5, refillIntervalMs: 1000 },
  docs: { capacity: 20, refillRate: 5, refillIntervalMs: 1000 },
  default: { capacity: 50, refillRate: 10, refillIntervalMs: 1000 },
} as const;
