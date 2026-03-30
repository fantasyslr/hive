import type { BoardSnapshot, Task } from './types';

const API_BASE = '/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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
  task_kind?: string;
  verification_required?: boolean;
}

export function createTask(data: CreateTaskPayload): Promise<Task> {
  return apiFetch<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
