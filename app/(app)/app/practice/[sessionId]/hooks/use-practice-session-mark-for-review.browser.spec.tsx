import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook } from 'vitest-browser-react';
import { PracticeView } from '@/app/(app)/app/practice/components/practice-view';
import type { LoadState } from '@/app/(app)/app/practice/practice-page-logic';
import { NotificationProvider } from '@/components/ui/notification-provider';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  PracticeSessionConflictMessages,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import {
  type SetPracticeSessionQuestionMarkFn,
  usePracticeSessionMarkForReview,
} from './use-practice-session-mark-for-review';

const fixtureQuestion1Id = crypto.randomUUID();
const fixtureSession1Id = crypto.randomUUID();

type ReviewState = {
  sessionId: string;
  mode: 'exam' | 'tutor';
  totalCount: number;
  answeredCount: number;
  markedCount: number;
  rows: Array<{
    questionId: string;
    markedForReview: boolean;
  }>;
} | null;

type ReviewUpdater = (prev: ReviewState) => ReviewState;

function MarkForReviewPracticeViewHarness(input: {
  setPracticeSessionQuestionMarkFn: SetPracticeSessionQuestionMarkFn;
}) {
  return (
    <NotificationProvider>
      <MarkForReviewPracticeViewContent
        setPracticeSessionQuestionMarkFn={
          input.setPracticeSessionQuestionMarkFn
        }
      />
    </NotificationProvider>
  );
}

function MarkForReviewPracticeViewContent(input: {
  setPracticeSessionQuestionMarkFn: SetPracticeSessionQuestionMarkFn;
}) {
  const question = createNextQuestion({
    questionId: fixtureQuestion1Id,
    slug: 'question-1',
    stemMd: 'What is the next best step?',
    difficulty: 'easy',
    session: null,
  });
  const [loadState, setLoadState] = useState<LoadState>({ status: 'ready' });
  const [sessionInfo, setSessionInfo] = useState<NextQuestion['session']>({
    sessionId: fixtureSession1Id,
    mode: 'exam' as const,
    deadlineAt: '2099-05-22T12:02:24.000Z',
    index: 0,
    total: 10,
    isMarkedForReview: false,
  });
  const [review, setReview] = useState<GetPracticeSessionReviewOutput | null>(
    null,
  );
  const markForReview = usePracticeSessionMarkForReview({
    question,
    sessionMode: 'exam',
    sessionInfo,
    sessionId: fixtureSession1Id,
    applySessionInfo: setSessionInfo,
    setLoadState,
    setReview,
    isMounted: () => true,
    setPracticeSessionQuestionMarkFn: input.setPracticeSessionQuestionMarkFn,
  });

  return (
    <>
      <PracticeView
        sessionInfo={sessionInfo}
        loadState={loadState}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        isMarkingForReview={markForReview.isMarkingForReview}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={markForReview.onToggleMarkForReview}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />
      <output data-testid="mark-state" aria-live="polite">
        {sessionInfo?.isMarkedForReview ? 'marked' : 'unmarked'}
      </output>
      <output data-testid="review-state" aria-live="polite">
        {review?.markedCount ?? 0}
      </output>
    </>
  );
}

describe('usePracticeSessionMarkForReview (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the question for review and updates state callbacks', async () => {
    const deferred =
      createDeferred<
        ActionResult<{
          sessionId: string;
          questionId: string;
          markedForReview: boolean;
        }>
      >();

    const setPracticeSessionQuestionMarkFn = vi.fn(() => deferred.promise);

    const applySessionInfo = vi.fn();
    const setReview = vi.fn();

    const harness = await renderHook(() =>
      usePracticeSessionMarkForReview({
        question: {
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Question',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: fixtureSession1Id,
        applySessionInfo,
        setLoadState: vi.fn(),
        setReview,
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    const pending = harness.result.current.onToggleMarkForReview();
    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(true);

    deferred.resolve(
      ok({
        sessionId: fixtureSession1Id,
        questionId: fixtureQuestion1Id,
        markedForReview: true,
      }),
    );
    await pending;

    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(false);

    expect(setPracticeSessionQuestionMarkFn).toHaveBeenCalledWith({
      sessionId: fixtureSession1Id,
      questionId: fixtureQuestion1Id,
      markedForReview: true,
      idempotencyKey: expect.any(String),
    });

    expect(applySessionInfo).toHaveBeenCalledTimes(1);
    const sessionUpdater = applySessionInfo.mock.calls[0]?.[0];
    expect(sessionUpdater).toBeTypeOf('function');
    expect(
      (sessionUpdater as (prev: unknown) => unknown)({
        sessionId: fixtureSession1Id,
        mode: 'exam',

        deadlineAt: '2099-05-22T12:02:24.000Z',

        index: 0,
        total: 10,
        isMarkedForReview: false,
      }),
    ).toEqual({
      sessionId: fixtureSession1Id,
      mode: 'exam',

      deadlineAt: '2099-05-22T12:02:24.000Z',

      index: 0,
      total: 10,
      isMarkedForReview: true,
    });

    expect(setReview).toHaveBeenCalled();
    const reviewUpdater = setReview.mock.calls[0]?.[0] as
      | ReviewUpdater
      | undefined;
    expect(reviewUpdater).toBeDefined();
    expect(
      reviewUpdater?.({
        sessionId: fixtureSession1Id,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [{ questionId: fixtureQuestion1Id, markedForReview: false }],
      }),
    ).toEqual({
      sessionId: fixtureSession1Id,
      mode: 'exam',
      totalCount: 1,
      answeredCount: 1,
      markedCount: 1,
      rows: [{ questionId: fixtureQuestion1Id, markedForReview: true }],
    });
  });

  it('sets loadState error when mark-for-review request throws', async () => {
    const setPracticeSessionQuestionMarkFn = vi
      .fn()
      .mockRejectedValue(new Error('Mark for review failed'));

    const setLoadState = vi.fn();

    const harness = await renderHook(() =>
      usePracticeSessionMarkForReview({
        question: {
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Question',
          difficulty: 'easy',
          choices: [],
          session: null,
        },
        sessionMode: 'exam',
        sessionInfo: {
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
        sessionId: fixtureSession1Id,
        applySessionInfo: vi.fn(),
        setLoadState,
        setReview: vi.fn(),
        isMounted: () => true,
        setPracticeSessionQuestionMarkFn,
      }),
    );

    await harness.result.current.onToggleMarkForReview();
    await expect
      .poll(() => harness.result.current.isMarkingForReview)
      .toBe(false);

    expect(setLoadState).toHaveBeenCalledWith({
      status: 'error',
      message: 'Mark for review failed',
    });
  });

  it('keeps the question surface and announces a transient notice when mark-for-review loses a state-write race', async () => {
    const stateChangedConflict: ActionResult<{
      questionId: string;
      markedForReview: boolean;
    }> = {
      ok: false,
      error: {
        code: 'CONFLICT',
        message: PracticeSessionConflictMessages.StateChangedConcurrently,
        details: {
          reason: PracticeSessionConflictReasons.StateChangedConcurrently,
        },
      },
    };
    const setPracticeSessionQuestionMarkFn: SetPracticeSessionQuestionMarkFn =
      vi.fn(async () => stateChangedConflict);

    const screen = await render(
      <MarkForReviewPracticeViewHarness
        setPracticeSessionQuestionMarkFn={setPracticeSessionQuestionMarkFn}
      />,
    );

    await screen.getByRole('button', { name: 'Mark for review' }).click();

    await expect
      .element(screen.getByTestId('app-toast'))
      .toHaveAttribute('role', 'status');
    await expect
      .element(screen.getByTestId('app-toast'))
      .toHaveTextContent(/changed in another tab/i);
    await expect
      .element(screen.getByText('What is the next best step?'))
      .toBeVisible();
    await expect
      .element(screen.getByTestId('mark-state'))
      .toHaveTextContent(/^unmarked$/);
    await expect
      .element(screen.getByRole('button', { name: 'Mark for review' }))
      .toHaveAttribute('aria-pressed', 'false');
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });
});
