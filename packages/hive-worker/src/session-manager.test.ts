import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SessionManager(5000); // 5s timeout for tests
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('register stores session and isActive returns true', () => {
    manager.register('run-1', process.pid); // use own pid (guaranteed alive)
    expect(manager.isActive('run-1')).toBe(true);
  });

  it('isActive returns false for unknown runId', () => {
    expect(manager.isActive('nonexistent')).toBe(false);
  });

  it('unregister removes session', () => {
    manager.register('run-1', process.pid);
    manager.unregister('run-1');
    expect(manager.isActive('run-1')).toBe(false);
  });

  it('get returns session entry after register', () => {
    manager.register('run-1', process.pid);
    const entry = manager.get('run-1');
    expect(entry).toBeDefined();
    expect(entry!.runId).toBe('run-1');
    expect(entry!.pid).toBe(process.pid);
  });

  it('touch updates lastActivityAt', () => {
    manager.register('run-1', process.pid);
    const before = manager.get('run-1')!.lastActivityAt;
    vi.advanceTimersByTime(1000);
    manager.touch('run-1');
    const after = manager.get('run-1')!.lastActivityAt;
    expect(after).toBeGreaterThan(before);
  });

  it('cleanup removes stale sessions after timeout', () => {
    manager.register('run-1', process.pid);
    // Advance past timeout
    vi.advanceTimersByTime(6000);
    // Trigger cleanup interval (every 60s, but we set short timeout)
    vi.advanceTimersByTime(60_000);
    expect(manager.isActive('run-1')).toBe(false);
  });

  it('isActive returns false for dead process', () => {
    // PID 999999 almost certainly doesn't exist
    manager.register('run-dead', 999999);
    expect(manager.isActive('run-dead')).toBe(false);
  });

  it('destroy clears all sessions', () => {
    manager.register('run-1', process.pid);
    manager.register('run-2', process.pid);
    manager.destroy();
    expect(manager.isActive('run-1')).toBe(false);
    expect(manager.isActive('run-2')).toBe(false);
  });
});
