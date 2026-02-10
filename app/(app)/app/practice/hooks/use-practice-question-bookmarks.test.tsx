// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeQuestionBookmarks } from './use-practice-question-bookmarks';

describe('usePracticeQuestionBookmarks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() =>
      usePracticeQuestionBookmarks({
        question: null,
        isMounted: () => true,
      }),
    );

    expect(output.bookmarkStatus).toBe('idle');
    expect(output.bookmarkMessage).toBeNull();
    expect(output.bookmarkMessageVersion).toBe(0);
    expect(output.isBookmarked).toBe(false);
    expect(typeof output.onRetryBookmarks).toBe('function');
    expect(typeof output.onToggleBookmark).toBe('function');
  });
});
