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

  constructor(capacity = EVENT_BUFFER_CAPACITY) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
    this.channel = createChannel();
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
