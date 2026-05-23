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
} from './practice-session-page-controller.browser.fixtures';
import {
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
  PracticeSessionPageControllerReviewProbe,
  PracticeSessionPageControllerSubmitDuringReviewProbe,
  PracticeSessionPageControllerViewProbe,
  setupPracticeSessionPageControllerBrowserSpec,
  submitAnswerMock,
} from './use-practice-session-page-controller-test-helpers';

setupPracticeSessionPageControllerBrowserSpec();

describe('usePracticeSessionPageController (browser)', () => {
  it('finalizes active exam review through finalizeExamAnswers', async () => {
    getPracticeSessionSummaryMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );
    getNextQuestionMock.mockResolvedValue(
      ok(
        createQuestionResponse({
          questionId: 'question-1',
          choices: [CHOICE_1, CHOICE_2, CHOICE_3],
          session: {
            mode: 'exam',
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
          rows: [createReviewRow({ questionId: 'question-1', order: 1 })],
        }),
      ),
    );
    finalizeExamAnswersMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
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
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'question-1',
            slug: 'question-1',
            stemMd: 'Question 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: false,
            choices: [{ id: 'choice_1', label: 'A', textMd: 'Choice A' }],
            selectedChoiceId: 'choice_1',
            correctChoiceId: 'choice_1',
            explanationMd: 'Because A is correct.',
            referenceMd: null,
            choiceExplanations: [],
          },
          {
            isAvailable: true,
            questionId: 'question-2',
            slug: 'question-2',
            stemMd: 'Question 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: false,
            isCorrect: false,
            isOmitted: false,
            markedForReview: false,
            choices: [{ id: 'choice_2', label: 'A', textMd: 'Choice B' }],
            selectedChoiceId: null,
            correctChoiceId: 'choice_2',
            explanationMd: 'Because B is correct.',
            referenceMd: null,
            choiceExplanations: [],
          },
        ],
      }),
    );

    const screen = await render(<PracticeSessionPageControllerReviewProbe />);

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
      .toHaveTextContent('question-1');
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(endPracticeSessionMock).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'view-summary' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-session-id'))
      .toHaveTextContent('session-1');
  });

  it('restores the navigator when opening an exam question from Review & Submit', async () => {
    mockExamReviewNavigationSession();

    const screen = await render(<PracticeSessionPageControllerViewProbe />);

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

    const screen = await render(<PracticeSessionPageControllerViewProbe />);

    await openExamReviewQuestion(screen);

    await screen.getByRole('button', { name: 'Previous' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'Next' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
  });

  it('returns to Review & Submit after navigating back out of a reopened exam question', async () => {
    mockExamReviewNavigationSession();

    const screen = await render(<PracticeSessionPageControllerViewProbe />);

    await openExamReviewQuestion(screen);

    await screen.getByRole('button', { name: 'Next' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-3');

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
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1],
        session: {
          sessionId: 'session-1',
          mode: 'exam',
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
      questionId: 'question-1',
      order: 1,
    });
    const answeredRow = createReviewRow({
      questionId: 'question-1',
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
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: null,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      });
    });

    const screen = await render(<PracticeSessionPageControllerReviewProbe />);

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
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: 'session-1',
            mode: 'exam',
            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-2',
          slug: 'question-2',
          stemMd: 'Question 2',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: 'session-1',
            mode: 'exam',
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
      <PracticeSessionPageControllerSubmitDuringReviewProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();

    await screen.getByRole('button', { name: 'review-answers' }).click();
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('review');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('');

    deferred.resolve(
      ok({
        attemptId: 'attempt-1',
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
      .toHaveTextContent('');
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
  });
});
