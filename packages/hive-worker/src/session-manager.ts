const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface SessionEntry {
  runId: string;
  pid: number;
  startedAt: number;
  lastActivityAt: number;
}

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private timeoutMs = SESSION_TIMEOUT_MS) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  register(runId: string, pid: number): void {
    const now = Date.now();
    this.sessions.set(runId, {
      runId,
      pid,
      startedAt: now,
      lastActivityAt: now,
    });
  }

  unregister(runId: string): void {
    this.sessions.delete(runId);
  }

  isActive(runId: string): boolean {
    const entry = this.sessions.get(runId);
    if (!entry) return false;
    // Check if process is still alive
    try {
      process.kill(entry.pid, 0);
      return true;
    } catch {
      // Process is dead — clean up
      this.sessions.delete(runId);
      return false;
    }
  }

  touch(runId: string): void {
    const entry = this.sessions.get(runId);
    if (entry) {
      entry.lastActivityAt = Date.now();
    }
  }

  get(runId: string): SessionEntry | undefined {
    return this.sessions.get(runId);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [runId, entry] of this.sessions) {
      if (now - entry.lastActivityAt > this.timeoutMs) {
        this.sessions.delete(runId);
      }
    }
  }
}
