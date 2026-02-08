// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionNavigator } from './use-practice-session-navigator';

describe('usePracticeSessionNavigator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns idle state with null navigator when disabled', () => {
    const output = renderHook(() =>
      usePracticeSessionNavigator({
        summary: null,
        isInReviewStage: false,
        sessionInfo: null,
        sessionId: 'session-1',
        questionId: null,
        submitResult: null,
        navigatorReloadCount: 0,
        getPracticeSessionReviewFn: vi.fn(),
        isMounted: () => true,
      }),
    );

    expect(output.navigator).toBeNull();
    expect(output.navigatorLoadState).toEqual({ status: 'idle' });
  });
});
