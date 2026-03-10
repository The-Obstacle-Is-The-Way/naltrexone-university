// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionControls } from './use-practice-session-controls';

let DEFAULT_SESSION_COUNT: number | undefined;

describe('usePracticeSessionControls', () => {
  beforeAll(async () => {
    DEFAULT_SESSION_COUNT = (
      (await import('../practice-page-logic')) as Record<string, unknown>
    ).DEFAULT_SESSION_COUNT as number | undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() => usePracticeSessionControls());

    expect(output.filters).toEqual({
      tagSlugs: [],
      difficulty: null,
      status: 'unanswered',
    });
    expect(output.sessionMode).toBe('tutor');
    expect(DEFAULT_SESSION_COUNT).toBe(20);
    expect(output.sessionCount).toBe(DEFAULT_SESSION_COUNT);
    expect(output.sessionCountInputValue).toBe(String(DEFAULT_SESSION_COUNT));
    expect(output.availableCountStatus).toBe('loading');
    expect(output.availableCount).toBeNull();
    expect(output.tagLoadStatus).toBe('loading');
    expect(output.availableTags).toEqual([]);
    expect(output.sessionStartStatus).toBe('idle');
    expect(output.sessionStartError).toBeNull();
    expect(output.incompleteSessionStatus).toBe('loading');
    expect(output.incompleteSessionError).toBeNull();
    expect(output.incompleteSession).toBeNull();
    expect(typeof output.onSessionModeChange).toBe('function');
    expect(typeof output.onSessionCountChange).toBe('function');
    expect(typeof output.onSessionCountBlur).toBe('function');
    expect(typeof output.onToggleTag).toBe('function');
    expect(typeof output.onDifficultyChange).toBe('function');
    expect(typeof output.onStatusChange).toBe('function');
    expect(typeof output.onStartSession).toBe('function');
    expect(typeof output.onAbandonIncompleteSession).toBe('function');
  });
});
