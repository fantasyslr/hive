import type { BoardSnapshot, Task } from './types';

const API_BASE = '/api';

function getToken(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('hive_token', urlToken);
      return urlToken;
    }
    const stored = localStorage.getItem('hive_token');
    if (stored) return stored;
  }
  return 'hive-token-manager';
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function fetchBoard(): Promise<BoardSnapshot> {
  return apiFetch<BoardSnapshot>('/board');
}

export function fetchTasks(): Promise<Task[]> {
  return apiFetch<Task[]>('/tasks');
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  requiredCapabilities?: string[];
  createdBy: string;
  taskKind?: string;
  verificationRequired?: boolean;
}

export function createTask(data: CreateTaskPayload): Promise<Task> {
  return apiFetch<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
