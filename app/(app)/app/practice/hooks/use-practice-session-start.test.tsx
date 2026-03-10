// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionStart } from './use-practice-session-start';

describe('usePracticeSessionStart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeSessionStart({
        isMounted: () => true,
      }),
    );

    expect(output.filters).toEqual({
      tagSlugs: [],
      difficulty: null,
      status: 'unanswered',
    });
    expect(output.sessionMode).toBe('tutor');
    expect(output.sessionCount).toBe(20);
    expect(output.sessionCountInputValue).toBe('20');
    expect(output.sessionStartStatus).toBe('idle');
    expect(output.sessionStartError).toBeNull();
    expect(typeof output.onSessionModeChange).toBe('function');
    expect(typeof output.onSessionCountChange).toBe('function');
    expect(typeof output.onSessionCountBlur).toBe('function');
    expect(typeof output.onToggleTag).toBe('function');
    expect(typeof output.onDifficultyChange).toBe('function');
    expect(typeof output.onStatusChange).toBe('function');
    expect(typeof output.onStartSession).toBe('function');
  });
});
