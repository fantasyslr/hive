import pino from 'pino';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const logger = pino({
  level: config.logLevel,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// --- Auth: fixed users with Bearer tokens ---

export interface HiveUser {
  id: string;
  name: string;
  role: 'ad_buyer' | 'operations' | 'creative' | 'manager';
  token: string;
}

const defaultUsers: HiveUser[] = [
  { id: 'ad_buyer', name: '投放', role: 'ad_buyer', token: 'hive-token-ad-buyer' },
  { id: 'operations', name: '运营', role: 'operations', token: 'hive-token-operations' },
  { id: 'creative', name: '素材', role: 'creative', token: 'hive-token-creative' },
  { id: 'manager', name: '主管', role: 'manager', token: 'hive-token-manager' },
];

function loadUsers(): HiveUser[] {
  const raw = process.env.HIVE_USERS;
  if (!raw) return defaultUsers;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return defaultUsers;
  } catch {
    logger.warn('Failed to parse HIVE_USERS env var, using defaults');
    return defaultUsers;
  }
}

export const hiveUsers: HiveUser[] = loadUsers();
export const tokenToUser: Map<string, HiveUser> = new Map(
  hiveUsers.map((u) => [u.token, u]),
);
