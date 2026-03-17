import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionQuestionFlow } from './use-practice-session-question-flow';

describe('usePracticeSessionQuestionFlow (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call getNextQuestionFn on mount when autoload is false', async () => {
    const getNextQuestionFn = vi.fn<
      (input: unknown) => Promise<ActionResult<NextQuestion | null>>
    >(async () => {
      throw new Error(
        'getNextQuestionFn should not run when autoload is false',
      );
    });
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();

    await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        autoload: false,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
      }),
    );

    await expect.poll(() => getNextQuestionFn.mock.calls.length).toBe(0);
  });

  it('calls getNextQuestionFn on mount when autoload is omitted', async () => {
    const getNextQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>()
      .mockResolvedValue(ok(null));
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();

    await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
      }),
    );

    await expect.poll(() => getNextQuestionFn.mock.calls.length).toBe(1);
  });

  it('returns null sessionInfo after resetQuestionState clears stale session metadata', async () => {
    const getNextQuestionFn =
      vi.fn<(input: unknown) => Promise<ActionResult<NextQuestion | null>>>();
    const submitAnswerFn =
      vi.fn<(input: unknown) => Promise<ActionResult<SubmitAnswerOutput>>>();

    const harness = await renderHook(() =>
      usePracticeSessionQuestionFlow({
        sessionId: 'session-1',
        autoload: false,
        isMounted: () => true,
        getNextQuestionFn,
        submitAnswerFn,
      }),
    );

    harness.result.current.applySessionInfo({
      sessionId: 'session-1',
      mode: 'tutor',
      index: 0,
      total: 2,
      isMarkedForReview: false,
    });

    await expect
      .poll(() => harness.result.current.sessionInfo?.sessionId ?? null)
      .toBe('session-1');

    harness.result.current.resetQuestionState();

    await expect.poll(() => harness.result.current.sessionInfo).toBeNull();
  });
});
