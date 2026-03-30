import { useEffect, useRef, useState } from 'react';
import type { HiveEvent, HiveEventType } from '../lib/types';

const SSE_URL = '/api/events/stream/public';

const EVENT_TYPES: HiveEventType[] = [
  'task.assigned',
  'task.updated',
  'task.completed',
  'task.failed',
  'agent.online',
  'agent.offline',
  'memory.updated',
  'feishu.changed',
];

interface UseSSEOptions {
  onEvent: (event: HiveEvent) => void;
}

export function useSSE({ onEvent }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const evtSource = new EventSource(SSE_URL);

    evtSource.onopen = () => {
      setConnected(true);
    };

    evtSource.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    // Listen to typed events from better-sse
    for (const eventType of EVENT_TYPES) {
      evtSource.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event: HiveEvent = {
            id: Number(e.lastEventId) || 0,
            type: eventType,
            data,
            timestamp: new Date().toISOString(),
          };
          onEventRef.current(event);
        } catch {
          // Ignore parse errors
        }
      });
    }

    // Also handle generic messages
    evtSource.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const event: HiveEvent = {
          id: Number(e.lastEventId) || 0,
          type: data.type || 'task.updated',
          data,
          timestamp: new Date().toISOString(),
        };
        onEventRef.current(event);
      } catch {
        // Ignore parse errors
      }
    };

    return () => {
      evtSource.close();
      setConnected(false);
    };
  }, []);

  return { connected };
}
