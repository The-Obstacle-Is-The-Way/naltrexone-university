import { describe, expect, it, vi } from 'vitest';
import { scheduleBookmarkMessageAutoClear } from './bookmark-message-timeout';

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
    let timeoutCallback: (() => void) | null = null;

    scheduleBookmarkMessageAutoClear({
      timeoutIdRef,
      setBookmarkMessage,
      isMounted: () => true,
      setTimeoutFn: ((
        fn: () => void,
        _delayMs: number,
      ): ReturnType<typeof setTimeout> => {
        timeoutCallback = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as (
        callback: () => void,
        delayMs: number,
      ) => ReturnType<typeof setTimeout>,
      clearTimeoutFn: vi.fn(),
    });

    if (!timeoutCallback) {
      throw new Error('Expected timeout callback to be captured');
    }
    (timeoutCallback as () => void)();

    expect(setBookmarkMessage).toHaveBeenCalledWith(null);
  });

  it('does not clear the message when timeout fires after unmount', () => {
    const timeoutIdRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    };
    const setBookmarkMessage = vi.fn();
    let timeoutCallback: (() => void) | null = null;

    scheduleBookmarkMessageAutoClear({
      timeoutIdRef,
      setBookmarkMessage,
      isMounted: () => false,
      setTimeoutFn: ((
        fn: () => void,
        _delayMs: number,
      ): ReturnType<typeof setTimeout> => {
        timeoutCallback = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as (
        callback: () => void,
        delayMs: number,
      ) => ReturnType<typeof setTimeout>,
      clearTimeoutFn: vi.fn(),
    });

    if (!timeoutCallback) {
      throw new Error('Expected timeout callback to be captured');
    }
    (timeoutCallback as () => void)();

    expect(setBookmarkMessage).not.toHaveBeenCalled();
  });
});
