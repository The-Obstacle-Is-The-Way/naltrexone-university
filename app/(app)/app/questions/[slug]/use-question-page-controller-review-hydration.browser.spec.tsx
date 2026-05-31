import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  getPracticeSessionReview,
  getPreviousAttempt,
  getQuestionBySlug,
  Probe,
  QUESTION_PAGE_ATTEMPT_1_ID,
  QUESTION_PAGE_CHOICE_1_ID,
  QUESTION_PAGE_CHOICE_2_ID,
  QUESTION_PAGE_QUESTION_1_ID,
  setupQuestionPageControllerBrowserSpec,
} from './use-question-page-controller-test-helpers';

setupQuestionPageControllerBrowserSpec();

describe('useQuestionPageController (browser)', () => {
  it('loads previous attempt and pre-populates state in review mode', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(QUESTION_PAGE_CHOICE_2_ID);
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(QUESTION_PAGE_ATTEMPT_1_ID);

    expect(getPreviousAttempt).toHaveBeenCalledWith({
      questionId: QUESTION_PAGE_QUESTION_1_ID,
    });
  });

  it('starts in loading-review state and clears it when previous attempt resolves', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

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
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('true');

    deferred.resolve(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferred.promise;

    await expect
      .element(screen.getByTestId('is-loading-previous-attempt'))
      .toHaveTextContent('false');
  });

  it('shows review loading state on the first render after mode changes to review', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

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
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
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
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    await deferred.promise;
  });

  it('normalizes mixed attemptId and sessionId by preferring sessionId in review mode', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000003';
    const sessionId = '00000000-0000-4000-8000-000000000004';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
          { id: QUESTION_PAGE_CHOICE_2_ID, label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: QUESTION_PAGE_QUESTION_1_ID,
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId,
        selectedChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_2_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(
      <Probe mode="review" attemptId={attemptId} sessionId={sessionId} />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    expect(getPreviousAttempt).toHaveBeenCalledWith({
      questionId: QUESTION_PAGE_QUESTION_1_ID,
      sessionId,
    });
  });
});
