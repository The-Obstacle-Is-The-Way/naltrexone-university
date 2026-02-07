// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/src/adapters/controllers/action-result';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { renderHook } from '@/src/application/test-helpers/render-hook';
import { usePracticeSessionMarkForReview } from './use-practice-session-mark-for-review';

describe('usePracticeSessionMarkForReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the expected initial state contract', async () => {
    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: null,
        sessionMode: null,
        sessionInfo: null,
        sessionId: 'session-1',
        setSessionInfo: () => undefined,
        setLoadState: () => undefined,
        setReview: () => undefined,
        isMounted: () => true,
      }),
    );

    expect(output.isMarkingForReview).toBe(false);
    expect(typeof output.onToggleMarkForReview).toBe('function');

    await expect(output.onToggleMarkForReview()).resolves.toBeUndefined();
  });

  it('passes an idempotency key when marking for review', async () => {
    const setLoadState = vi.fn();
    const setSessionInfo = vi.fn();
    const setReview = vi.fn();
    const setPracticeSessionQuestionMarkFn = vi.fn(async () =>
      ok({
        questionId: 'q_1',
        markedForReview: true,
      }),
    );

    const output = renderHook(() =>
      usePracticeSessionMarkForReview({
        question: createNextQuestion(),
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: 'session-1',
        setSessionInfo,
        setLoadState,
        setReview,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    await output.onToggleMarkForReview();

    expect(setPracticeSessionQuestionMarkFn).toHaveBeenCalledWith({
      sessionId: 'session-1',
      questionId: 'q_1',
      markedForReview: true,
      idempotencyKey: expect.any(String),
    });
    expect(setLoadState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });
});
