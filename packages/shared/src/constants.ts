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
  'memory.updated', 'feishu.changed',
] as const;

/** Events reserved for Gateway internal use — agents cannot publish these */
export const RESERVED_EVENT_TYPES = [
  'task.assigned', 'task.completed', 'task.failed',
  'agent.online', 'agent.offline',
] as const;

/** Events agents are allowed to publish via POST /events */
export const AGENT_PUBLISHABLE_EVENT_TYPES = [
  'task.updated', 'memory.updated', 'feishu.changed',
] as const;

export const MEMORY_NAMESPACES = {
  PUBLIC_CONCLUSIONS: 'public/conclusions',
  PUBLIC_BOARD: 'public/board',
  AGENT_PREFIX: 'agent',
} as const;

export const SNAPSHOT_DEBOUNCE_MS = 2000;

export const ROUTING_WEIGHTS = {
  INTEREST_MATCH: 50,
  CAPABILITY_MATCH: 20,
  LOAD_BASE: 30,
  LOAD_PER_TASK: 10,
} as const;

export const STARVATION_THRESHOLD_MS = 60_000; // 60 seconds idle triggers boost
export const STARVATION_BOOST = 40;            // enough to compete with interest match
