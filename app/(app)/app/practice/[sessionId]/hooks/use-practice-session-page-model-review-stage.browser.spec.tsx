import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  createQuestionResponse,
  createReviewResponse,
  createReviewRow,
} from './practice-session-page-model.browser.fixtures';
import {
  BROWSER_ATTEMPT_1_ID,
  BROWSER_CHOICE_1_ID,
  BROWSER_CHOICE_2_ID,
  BROWSER_QUESTION_1_ID,
  BROWSER_QUESTION_2_ID,
  BROWSER_QUESTION_3_ID,
  BROWSER_SESSION_ID,
  CHOICE_1,
  CHOICE_2,
  CHOICE_3,
  endPracticeSessionMock,
  errorResult,
  finalizeExamAnswersMock,
  getBookmarksMock,
  getCompletedSessionQuestionsWithFeedbackMock,
  getNextQuestionMock,
  getPracticeSessionReviewMock,
  getPracticeSessionSummaryMock,
  mockBookmarksAndReview,
  mockExamReviewNavigationSession,
  openExamReviewQuestion,
  PracticeSessionPageModelReviewProbe,
  PracticeSessionPageModelSubmitDuringReviewProbe,
  PracticeSessionPageModelViewProbe,
  setupPracticeSessionPageModelBrowserSpec,
  submitAnswerMock,
} from './use-practice-session-page-model-test-helpers';

setupPracticeSessionPageModelBrowserSpec();

describe('usePracticeSessionPageModel (browser)', () => {
  it('finalizes active exam review through finalizeExamAnswers', async () => {
    getPracticeSessionSummaryMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );
    getNextQuestionMock.mockResolvedValue(
      ok(
        createQuestionResponse({
          questionId: BROWSER_QUESTION_1_ID,
          choices: [CHOICE_1, CHOICE_2, CHOICE_3],
          session: {
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      ),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok(
        createReviewResponse({
          mode: 'exam',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            createReviewRow({ questionId: BROWSER_QUESTION_1_ID, order: 1 }),
          ],
        }),
      ),
    );
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: BROWSER_SESSION_ID,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }),
    );
    getCompletedSessionQuestionsWithFeedbackMock.mockResolvedValue(
      ok({
        sessionId: BROWSER_SESSION_ID,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: BROWSER_QUESTION_1_ID,
            slug: 'question-1',
            stemMd: 'Question 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
            choices: [
              { id: BROWSER_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
            ],
            selectedChoiceId: BROWSER_CHOICE_1_ID,
            correctChoiceId: BROWSER_CHOICE_1_ID,
            explanationMd: 'Because A is correct.',
            referenceMd: null,
            choiceExplanations: [],
          },
          {
            isAvailable: true,
            questionId: BROWSER_QUESTION_2_ID,
            slug: 'question-2',
            stemMd: 'Question 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: false,
            isCorrect: false,
            isOmitted: true,
            markedForReview: false,
            choices: [
              { id: BROWSER_CHOICE_2_ID, label: 'A', textMd: 'Choice B' },
            ],
            selectedChoiceId: null,
            correctChoiceId: BROWSER_CHOICE_2_ID,
            explanationMd: 'Because B is correct.',
            referenceMd: null,
            choiceExplanations: [],
          },
        ],
      }),
    );

    const screen = await render(<PracticeSessionPageModelReviewProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');

    await screen.getByRole('button', { name: 'review-answers' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');

    await screen.getByRole('button', { name: 'finalize-review' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('post-exam-review');
    await expect
      .element(screen.getByTestId('post-exam-current-question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(endPracticeSessionMock).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'view-summary' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-session-id'))
      .toHaveTextContent(BROWSER_SESSION_ID);
  });

  it('restores the navigator when opening an exam question from Review & Submit', async () => {
    mockExamReviewNavigationSession();

    const screen = await render(<PracticeSessionPageModelViewProbe />);

    await openExamReviewQuestion(screen);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await expect
      .element(screen.getByTestId('navigator-load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('navigator-question-count'))
      .toHaveTextContent('3');
    await expect.element(screen.getByText('Question navigator')).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Previous' }))
      .toBeEnabled();
    await expect
      .element(screen.getByRole('button', { name: 'Next' }))
      .toBeEnabled();
  });

  it('navigates to adjacent exam questions after returning from Review & Submit', async () => {
    mockExamReviewNavigationSession();

    const screen = await render(<PracticeSessionPageModelViewProbe />);

    await openExamReviewQuestion(screen);

    await screen.getByRole('button', { name: 'Previous' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);

    await screen.getByRole('button', { name: 'Next' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_2_ID);
  });

  it('returns to Review & Submit after navigating back out of a reopened exam question', async () => {
    mockExamReviewNavigationSession();

    const screen = await render(<PracticeSessionPageModelViewProbe />);

    await openExamReviewQuestion(screen);

    await screen.getByRole('button', { name: 'Next' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_3_ID);

    await screen.getByRole('button', { name: 'Review & Submit' }).click();
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');
    await expect
      .element(screen.getByRole('heading', { name: 'Review & Submit' }))
      .toBeVisible();
  });

  it('refreshes review data after answering a review-opened question', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok({
        questionId: BROWSER_QUESTION_1_ID,
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1],
        session: {
          sessionId: BROWSER_SESSION_ID,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 1,
          isMarkedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
        },
      }),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    const unansweredRow = createReviewRow({
      questionId: BROWSER_QUESTION_1_ID,
      order: 1,
    });
    const answeredRow = createReviewRow({
      questionId: BROWSER_QUESTION_1_ID,
      order: 1,
      isAnswered: true,
      isCorrect: true,
    });
    let hasAnsweredReviewQuestion = false;
    getPracticeSessionReviewMock.mockImplementation(async () =>
      ok(
        createReviewResponse({
          mode: 'exam',
          totalCount: 1,
          answeredCount: hasAnsweredReviewQuestion ? 1 : 0,
          markedCount: 0,
          rows: [hasAnsweredReviewQuestion ? answeredRow : unansweredRow],
        }),
      ),
    );
    submitAnswerMock.mockImplementation(async () => {
      hasAnsweredReviewQuestion = true;
      return ok({
        attemptId: BROWSER_ATTEMPT_1_ID,
        isCorrect: true,
        correctChoiceId: null,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      });
    });

    const screen = await render(<PracticeSessionPageModelReviewProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'review-answers' }).click();
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');
    await expect
      .element(screen.getByTestId('review-answered-count'))
      .toHaveTextContent('0');

    await screen
      .getByRole('button', { name: 'open-review-question-1' })
      .click();
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();
    await expect
      .element(screen.getByTestId('has-submit-result'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'review-answers' }).click();
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');
    await expect
      .element(screen.getByTestId('review-answered-count'))
      .toHaveTextContent('1');
    await expect
      .element(screen.getByTestId('review-row-answered'))
      .toHaveTextContent('true');
  });

  it('does not auto-advance after submit when review stage becomes active before the submit resolves', async () => {
    const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestionMock
      .mockResolvedValueOnce(
        ok({
          questionId: BROWSER_QUESTION_1_ID,
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: BROWSER_SESSION_ID,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          questionId: BROWSER_QUESTION_2_ID,
          slug: 'question-2',
          stemMd: 'Question 2',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: BROWSER_SESSION_ID,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 1,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
      }),
    );
    submitAnswerMock.mockImplementation(async () => deferred.promise);

    const screen = await render(
      <PracticeSessionPageModelSubmitDuringReviewProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();

    await screen.getByRole('button', { name: 'review-answers' }).click();
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(/^$/);

    deferred.resolve(
      ok({
        attemptId: BROWSER_ATTEMPT_1_ID,
        isCorrect: true,
        correctChoiceId: null,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(/^$/);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
  });
});
