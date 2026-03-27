import { createChannel } from 'better-sse';
import type { Channel } from 'better-sse';
import type { HiveEvent, HiveEventType } from '@hive/shared';
import { EVENT_BUFFER_CAPACITY } from '@hive/shared';
import { logger } from '../config.js';

export class EventBus {
  private counter = 0;
  private buffer: Array<HiveEvent | null>;
  private head = 0;
  private capacity: number;
  private channel: Channel;
  private listeners = new Map<string, Set<(event: HiveEvent) => void>>();

  constructor(capacity = EVENT_BUFFER_CAPACITY) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
    this.channel = createChannel();
  }

  on(eventType: string, handler: (event: HiveEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
  }

  off(eventType: string, handler: (event: HiveEvent) => void): void {
    this.listeners.get(eventType)?.delete(handler);
  }

  emit(event: Omit<HiveEvent, 'id' | 'timestamp'>): HiveEvent {
    const id = ++this.counter;
    const full: HiveEvent = {
      ...event,
      id,
      timestamp: new Date().toISOString(),
    };

    // Store in ring buffer
    this.buffer[this.head % this.capacity] = full;
    this.head++;

    // Broadcast to all connected SSE sessions
    this.channel.broadcast(JSON.stringify(full.data), full.type, {
      eventId: full.id.toString(),
    });

    // Fire local listeners (sync call, handlers should be non-blocking internally)
    const handlers = this.listeners.get(full.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(full);
        } catch (err) {
          logger.error({ err, eventType: full.type }, 'Local listener error');
        }
      }
    }

    logger.info({ eventId: full.id, type: full.type }, 'Event emitted');
    return full;
  }

  getEventsAfter(lastId: number): HiveEvent[] {
    return this.buffer
      .filter((e): e is HiveEvent => e !== null && e.id > lastId)
      .sort((a, b) => a.id - b.id);
  }

  getChannel(): Channel {
    return this.channel;
  }
}

export const eventBus = new EventBus();
