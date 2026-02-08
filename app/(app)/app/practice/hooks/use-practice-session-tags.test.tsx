// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionTags } from './use-practice-session-tags';

describe('usePracticeSessionTags', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', () => {
    const output = renderHook(() => usePracticeSessionTags());

    expect(output.tagLoadStatus).toBe('loading');
    expect(output.availableTags).toEqual([]);
  });
});
