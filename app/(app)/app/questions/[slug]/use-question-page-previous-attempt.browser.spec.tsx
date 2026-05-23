import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type {
  LoadState,
  SessionUnansweredReveal,
} from '@/app/(app)/app/questions/[slug]/question-page-logic';
import * as reportClientError from '@/lib/report-client-error';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import * as questionViewController from '@/src/adapters/controllers/question-view-controller';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { useQuestionPagePreviousAttempt } from './use-question-page-previous-attempt';

vi.mock('@/src/adapters/controllers/question-view-controller', { spy: true });
vi.mock('@/lib/report-client-error', { spy: true });

const getPreviousAttempt = vi.mocked(questionViewController.getPreviousAttempt);
const reportClientErrorSpy = vi.mocked(reportClientError.reportClientError);

const defaultQuestion: GetQuestionBySlugOutput = {
  questionId: 'question-1',
  slug: 'q-1',
  stemMd: 'Stem',
  difficulty: 'easy',
  choices: [
    { id: 'choice-1', label: 'A', textMd: 'Choice A' },
    { id: 'choice-2', label: 'B', textMd: 'Choice B' },
  ],
};

function Probe({
  mode,
  attemptId,
  sessionId,
  loadStatus = 'ready',
  question = defaultQuestion,
  onRender,
}: {
  mode?: 'review' | null;
  attemptId?: string;
  sessionId?: string;
  loadStatus?: 'loading' | 'ready' | 'error';
  question?: GetQuestionBySlugOutput | null;
  onRender?: (snapshot: {
    mode?: 'review' | null;
    isLoadingPreviousAttempt: boolean;
    reviewHydrationState: string | null;
  }) => void;
}) {
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitAnswerOutput | null>(
    null,
  );
  const [sessionUnansweredReveal, setSessionUnansweredReveal] =
    useState<SessionUnansweredReveal | null>(null);
  const loadState: LoadState =
    loadStatus === 'error'
      ? { status: 'error', message: 'Load failed' }
      : { status: loadStatus };

  const output = useQuestionPagePreviousAttempt({
    mode,
    attemptId,
    sessionId,
    loadState,
    question,
    setSelectedChoiceId,
    setSubmitResult,
    setSessionUnansweredReveal,
    isMounted: () => true,
    startTransition: (fn) => fn(),
  });

  onRender?.({
    mode,
    isLoadingPreviousAttempt: output.isLoadingPreviousAttempt,
    reviewHydrationState: output.reviewHydrationState,
  });

  return (
    <>
      <div data-testid="selected-choice">{selectedChoiceId ?? ''}</div>
      <div data-testid="attempt-id">{submitResult?.attemptId ?? ''}</div>
      <div data-testid="unanswered-reveal-correct-choice">
        {sessionUnansweredReveal?.correctChoiceId ?? ''}
      </div>
      <div data-testid="is-loading-previous-attempt">
        {output.isLoadingPreviousAttempt ? 'true' : 'false'}
      </div>
      <div data-testid="review-hydration-state">
        {output.reviewHydrationState ?? ''}
      </div>
      <button
        type="button"
        data-testid="reset-review-hydration-state"
        onClick={output.resetReviewHydrationState}
      >
        Reset review hydration state
      </button>
    </>
  );
}

describe('useQuestionPagePreviousAttempt (browser)', () => {
  beforeEach(() => {
    reportClientErrorSpy.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads previous attempt and pre-populates state in review mode', async () => {
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-2');
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-1');
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('attempt');

    expect(getPreviousAttempt).toHaveBeenCalledWith({
      questionId: 'question-1',
    });
  });

  it('shows review loading state on the first render after mode changes to review', async () => {
    const deferred =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isOmitted: boolean;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();
    getPreviousAttempt.mockReturnValue(deferred.promise);

    const reviewSnapshots: Array<{
      mode?: 'review' | null;
      isLoadingPreviousAttempt: boolean;
      reviewHydrationState: string | null;
    }> = [];

    function Wrapper() {
      const [mode, setMode] = useState<'review' | null>(null);

      return (
        <>
          <Probe
            mode={mode}
            onRender={(snapshot) => {
              if (snapshot.mode === 'review') {
                reviewSnapshots.push(snapshot);
              }
            }}
          />
          <button
            type="button"
            data-testid="set-review-mode"
            onClick={() => setMode('review')}
          >
            Set review mode
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent(/^$/);

    await screen.getByTestId('set-review-mode').click();

    expect(reviewSnapshots[0]).toEqual({
      mode: 'review',
      isLoadingPreviousAttempt: true,
      reviewHydrationState: 'no_prior_attempt',
    });

    deferred.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferred.promise;
  });

  it('ignores an in-flight previous-attempt response after reset', async () => {
    const deferred =
      createDeferred<
        ActionResult<{
          kind: 'attempt';
          sessionMode: 'tutor' | 'exam' | null;
          attemptId: string;
          selectedChoiceId: string;
          isOmitted: boolean;
          isCorrect: boolean;
          correctChoiceId: string;
          explanationMd: string | null;
          referenceMd: string | null;
          choiceExplanations: [];
          answeredAt: string;
        }>
      >();
    getPreviousAttempt.mockReturnValue(deferred.promise);

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('true');

    await screen.getByTestId('reset-review-hydration-state').click();

    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('no_prior_attempt');

    deferred.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: 'attempt-1',
        selectedChoiceId: 'choice-2',
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: 'choice-2',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferred.promise;
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('no_prior_attempt');
  });
});
