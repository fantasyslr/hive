// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSSE } from './useSSE';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  listeners: Record<string, ((e: any) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: any) => void) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }
  close() {
    this.closed = true;
  }
  // Helpers for tests
  simulateOpen() {
    this.onopen?.();
  }
  simulateError() {
    this.onerror?.();
  }
  simulateEvent(type: string, data: any) {
    const event = { data: JSON.stringify(data), lastEventId: '1' };
    (this.listeners[type] || []).forEach(cb => cb(event));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (global as any).EventSource = MockEventSource;
});

describe('useSSE', () => {
  it('sets connected=true on open', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSSE({ onEvent }));

    expect(result.current.connected).toBe(false);

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it('sets connected=false on error', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSSE({ onEvent }));

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      MockEventSource.instances[0].simulateError();
    });
    expect(result.current.connected).toBe(false);
  });

  it('calls onEvent with parsed HiveEvent on task.updated', () => {
    const onEvent = vi.fn();
    renderHook(() => useSSE({ onEvent }));

    act(() => {
      MockEventSource.instances[0].simulateEvent('task.updated', {
        taskId: 't1',
        status: 'working',
      });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    const event = onEvent.mock.calls[0][0];
    expect(event.type).toBe('task.updated');
    expect(event.data.taskId).toBe('t1');
    expect(event.id).toBe(1);
  });

  it('closes EventSource on unmount', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useSSE({ onEvent }));

    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    unmount();
    expect(es.closed).toBe(true);
  });
});
