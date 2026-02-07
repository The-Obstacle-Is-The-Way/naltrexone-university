import { describe, expect, it, vi } from 'vitest';
import { scheduleBookmarkMessageAutoClear } from './bookmark-message-timeout';

function createCapturingSetTimeout() {
  let captured: (() => void) | null = null;
  const fn = ((cb: () => void, _delay: number) => {
    captured = cb;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  return {
    fn,
    fire: () => {
      if (!captured) throw new Error('No callback captured');
      captured();
    },
  };
}

describe('scheduleBookmarkMessageAutoClear', () => {
  it('clears previous timeout before scheduling a new one', () => {
    const clearTimeoutFn = vi.fn();
    const setTimeoutFn = vi.fn(
      () => 2000 as unknown as ReturnType<typeof setTimeout>,
    );
    const timeoutIdRef = {
      current: 1000 as unknown as ReturnType<typeof setTimeout>,
    };
    const setBookmarkMessage = vi.fn();

    scheduleBookmarkMessageAutoClear({
      timeoutIdRef,
      setBookmarkMessage,
      isMounted: () => true,
      setTimeoutFn,
      clearTimeoutFn,
    });

    expect(clearTimeoutFn).toHaveBeenCalledWith(1000);
    expect(timeoutIdRef.current).toBe(2000);
  });

  it('clears the message when timeout fires and component is mounted', () => {
    const timeoutIdRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    };
    const setBookmarkMessage = vi.fn();
    const timer = createCapturingSetTimeout();

    scheduleBookmarkMessageAutoClear({
      timeoutIdRef,
      setBookmarkMessage,
      isMounted: () => true,
      setTimeoutFn: timer.fn,
      clearTimeoutFn: vi.fn(),
    });

    timer.fire();

    expect(setBookmarkMessage).toHaveBeenCalledWith(null);
  });

  it('does not clear the message when timeout fires after unmount', () => {
    const timeoutIdRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    };
    const setBookmarkMessage = vi.fn();
    const timer = createCapturingSetTimeout();

    scheduleBookmarkMessageAutoClear({
      timeoutIdRef,
      setBookmarkMessage,
      isMounted: () => false,
      setTimeoutFn: timer.fn,
      clearTimeoutFn: vi.fn(),
    });

    timer.fire();

    expect(setBookmarkMessage).not.toHaveBeenCalled();
  });
});
