import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import {
  getPracticeSessionReview,
  getPreviousAttempt,
  getQuestionBySlug,
  Probe,
  setupQuestionPageControllerBrowserSpec,
  submitAnswer,
} from './use-question-page-controller-test-helpers';

setupQuestionPageControllerBrowserSpec();

describe('useQuestionPageController (browser)', () => {
  it('supports inline retry in session review and submits standalone provenance payload', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000010';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
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
            questionId: 'question-1',
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

    submitAnswer.mockResolvedValue(
      ok({
        attemptId: 'attempt-2',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<Probe mode="review" sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent('choice-2');
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent('attempt-1');
    await expect
      .element(screen.getByTestId('session-nav-current-was-retried'))
      .toHaveTextContent('false');

    await screen.getByTestId('trigger-reattempt').click();
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);

    await screen.getByTestId('select-choice-1').click();
    await screen.getByTestId('trigger-submit').click();

    await expect
      .poll(() => submitAnswer.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(submitAnswer.mock.calls[0]?.[0]).toMatchObject({
      questionId: 'question-1',
      choiceId: 'choice-1',
      retryOfAttemptId: 'attempt-1',
      retryOrigin: 'session_review',
      retrySessionId: sessionId,
    });
    await expect
      .element(screen.getByTestId('session-nav-current-was-retried'))
      .toHaveTextContent('true');
  });

  it('maps kind=session_unanswered to reveal state and clears selected choice/result', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000011';

    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPracticeSessionReview.mockResolvedValue(
      ok({
        sessionId,
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            order: 1,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'session_unanswered',
        sessionMode: null,
        correctChoiceId: 'choice-2',
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<Probe mode="review" sessionId={sessionId} />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('selected-choice'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(/^$/);
    await expect
      .element(screen.getByTestId('unanswered-reveal-correct-choice'))
      .toHaveTextContent('choice-2');
  });

  it('requires explicit answer-as-new action after hydration error before submitting', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: 'choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'choice-2', label: 'B', textMd: 'Choice B' },
        ],
      }),
    );

    getPreviousAttempt.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Boom' },
    });

    submitAnswer.mockResolvedValue(
      ok({
        attemptId: 'attempt-3',
        isCorrect: true,
        correctChoiceId: 'choice-1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<Probe mode="review" from="history" />);

    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('hydration_error');

    await screen.getByTestId('trigger-answer-as-new').click();
    await expect
      .element(screen.getByTestId('review-hydration-state'))
      .toHaveTextContent('no_prior_attempt');

    await screen.getByTestId('select-choice-1').click();
    await screen.getByTestId('trigger-submit').click();

    await expect
      .poll(() => submitAnswer.mock.calls.length)
      .toBeGreaterThanOrEqual(1);
    expect(submitAnswer.mock.calls[0]?.[0]).toMatchObject({
      questionId: 'question-1',
      choiceId: 'choice-1',
    });
    expect(submitAnswer.mock.calls[0]?.[0]).not.toHaveProperty('retryOrigin');
    expect(submitAnswer.mock.calls[0]?.[0]).not.toHaveProperty(
      'retryOfAttemptId',
    );
  });
});
