export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:  ['claimed'],
  claimed:  ['working', 'pending'],
  working:  ['done', 'failed'],
  done:     [],
  failed:   ['pending'],
};

export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_RESPONSE_WINDOW_MS = 5_000;
export const HEARTBEAT_MAX_MISSES = 2;
export const EVENT_BUFFER_CAPACITY = 1000;

export const EVENT_TYPES = [
  'task.assigned', 'task.updated', 'task.completed',
  'task.failed', 'agent.online', 'agent.offline',
] as const;
