// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionStart } from './use-practice-session-start';

let DEFAULT_SESSION_COUNT: number | undefined;

describe('usePracticeSessionStart', () => {
  beforeAll(async () => {
    DEFAULT_SESSION_COUNT = (
      (await import('../practice-page-logic')) as Record<string, unknown>
    ).DEFAULT_SESSION_COUNT as number | undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionStart({
        isMounted: () => true,
        refreshIncompleteSession: async () => ({
          kind: 'loaded',
          session: null,
        }),
      }),
    );

    expect(output.filters).toEqual({
      tagSlugs: [],
      difficulty: null,
      status: 'unanswered',
    });
    expect(output.sessionMode).toBe('tutor');
    expect(DEFAULT_SESSION_COUNT).toBe(20);
    expect(output.sessionCount).toBe(DEFAULT_SESSION_COUNT);
    expect(output.sessionCountInputValue).toBe(String(DEFAULT_SESSION_COUNT));
    expect(output.sessionStartStatus).toBe('idle');
    expect(output.sessionStartError).toBeNull();
    expect(typeof output.onSessionModeChange).toBe('function');
    expect(typeof output.onSessionCountChange).toBe('function');
    expect(typeof output.onSessionCountBlur).toBe('function');
    expect(typeof output.onToggleTag).toBe('function');
    expect(typeof output.onDifficultyChange).toBe('function');
    expect(typeof output.onStatusChange).toBe('function');
    expect(typeof output.onStartSession).toBe('function');
    expect(typeof output.captureIdempotencyKeyRetirement).toBe('function');
  });
});
