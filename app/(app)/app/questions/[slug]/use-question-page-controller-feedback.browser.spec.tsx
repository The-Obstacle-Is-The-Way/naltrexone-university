import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import {
  getPreviousAttempt,
  getQuestionBySlug,
  getQuestionRating,
  Probe,
  QUESTION_PAGE_ATTEMPT_1_ID,
  QUESTION_PAGE_CHOICE_1_ID,
  QUESTION_PAGE_QUESTION_1_ID,
  rateQuestion,
  setupQuestionPageControllerBrowserSpec,
  submitQuestionReport,
} from './use-question-page-controller-test-helpers';

setupQuestionPageControllerBrowserSpec();

describe('useQuestionPageController feedback wiring (browser)', () => {
  it('hydrates and rates feedback for a standalone review question', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    getQuestionRating.mockResolvedValue(ok({ rating: 'not_helpful' }));
    rateQuestion.mockResolvedValue(ok({ rating: 'helpful' }));

    const screen = await render(
      <Probe mode="review" attemptId={QUESTION_PAGE_ATTEMPT_1_ID} />,
    );

    await expect
      .element(screen.getByTestId('question-rating'))
      .toHaveTextContent('not_helpful');
    expect(getQuestionRating).toHaveBeenCalledWith({
      questionId: QUESTION_PAGE_QUESTION_1_ID,
    });

    await screen.getByTestId('trigger-rate-good').click();

    await expect.poll(() => rateQuestion.mock.calls.length).toBe(1);
    expect(rateQuestion).toHaveBeenCalledWith({
      questionId: QUESTION_PAGE_QUESTION_1_ID,
      attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
      practiceSessionId: null,
      rating: 'helpful',
      idempotencyKey: expect.any(String),
    });
    await expect
      .element(screen.getByTestId('question-rating'))
      .toHaveTextContent('helpful');
  });

  it('submits report context for a standalone review question', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    const screen = await render(
      <Probe mode="review" attemptId={QUESTION_PAGE_ATTEMPT_1_ID} />,
    );

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByTestId('trigger-submit-report').click();

    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(1);
    expect(submitQuestionReport).toHaveBeenCalledWith({
      questionId: QUESTION_PAGE_QUESTION_1_ID,
      attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
      practiceSessionId: null,
      category: 'ambiguous_wording',
      comment: 'Needs source',
      idempotencyKey: expect.any(String),
    });
  });
});
