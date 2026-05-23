import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import {
  createChoice,
  createQuestionResponse,
  createReviewResponse,
} from './practice-session-page-controller.browser.fixtures';
import {
  CHOICE_1,
  CHOICE_2,
  CHOICE_3,
  getNextQuestionMock,
  mockBookmarksAndReview,
  PracticeSessionPageControllerHookProbe,
  PracticeSessionPageControllerNavigationProbe,
  saveExamDraftAnswerMock,
  setupPracticeSessionPageControllerBrowserSpec,
  submitAnswerMock,
} from './use-practice-session-page-controller-test-helpers';

setupPracticeSessionPageControllerBrowserSpec();

describe('usePracticeSessionPageController (browser)', () => {
  it('saves the current exam draft before moving to the next question', async () => {
    getNextQuestionMock
      .mockResolvedValueOnce(
        ok(
          createQuestionResponse({
            questionId: 'question-1',
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
      )
      .mockResolvedValueOnce(
        ok(
          createQuestionResponse({
            questionId: 'question-2',
            choices: [CHOICE_1, CHOICE_2, CHOICE_3],
            session: {
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

              index: 1,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      );
    saveExamDraftAnswerMock.mockResolvedValue(
      ok({
        questionId: 'question-1',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: 'choice_1',
        draftSavedAt: new Date('2026-02-07T00:00:00.000Z'),
        draftCumulativeMs: 1_000,
      }),
    );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
      }),
    );

    const screen = await render(
      <PracticeSessionPageControllerNavigationProbe />,
    );

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'next-question' }).click();

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledWith({
      sessionId: 'session-1',
      questionId: 'question-1',
      selectedChoiceId: 'choice_1',
      cumulativeMs: expect.any(Number),
    });
  });

  it('loads the current question and allows selecting a choice', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('true');
  });

  it('uses transition pending state for session answer submit without switching to loading status', async () => {
    const deferred = createDeferred<ActionResult<SubmitAnswerOutput>>();

    getNextQuestionMock.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
      }),
    );
    submitAnswerMock.mockImplementation(async () => deferred.promise);

    const screen = await render(<PracticeSessionPageControllerHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    deferred.resolve(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('does not programmatically submit an active exam question before review', async () => {
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

            deadlineAt: '2099-05-22T12:02:24.000Z',

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
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: null,
        explanationMd: null,
        referenceMd: null,
        choiceExplanations: [],
      }),
    );

    const screen = await render(<PracticeSessionPageControllerHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();

    expect(submitAnswerMock).not.toHaveBeenCalled();
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
  });

  it('restores draft selections when navigating away and back before submit', async () => {
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

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok(
          createQuestionResponse({
            questionId: 'question-2',
            difficulty: 'easy',
            choices: [createChoice({ id: 'choice_2' })],
            session: {
              sessionId: 'session-1',
              mode: 'exam',

              deadlineAt: '2099-05-22T12:02:24.000Z',

              index: 1,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      )
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

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
            draftSelectedChoiceId: 'choice_1',
            draftCumulativeMs: 1_000,
          },
        }),
      );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
      }),
    );

    const screen = await render(
      <PracticeSessionPageControllerNavigationProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('true');

    await screen.getByRole('button', { name: 'next-question' }).click();
    expect(getNextQuestionMock).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-1',
      fromIndex: 0,
    });
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');

    await screen.getByRole('button', { name: 'navigate-question-1' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('true');
  });

  it('restores submitResult when navigating away and back after submitting in tutor mode', async () => {
    getNextQuestionMock
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [CHOICE_1, CHOICE_2],
          session: {
            sessionId: 'session-1',
            mode: 'tutor',

            deadlineAt: null,

            index: 0,
            total: 2,
            isMarkedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-2',
          slug: 'question-2',
          stemMd: 'Question 2',
          difficulty: 'easy',
          choices: [CHOICE_3],
          session: {
            sessionId: 'session-1',
            mode: 'tutor',

            deadlineAt: null,

            index: 1,
            total: 2,
            isMarkedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [CHOICE_1, CHOICE_2],
          session: {
            sessionId: 'session-1',
            mode: 'tutor',

            deadlineAt: null,

            index: 0,
            total: 2,
            isMarkedForReview: false,
            latestSelectedChoiceId: 'choice_1',
            latestIsCorrect: false,
            previousSubmission: {
              correctChoiceId: 'choice_2',
              explanationMd: 'Because',
              referenceMd: null,
              choiceExplanations: [
                {
                  choiceId: 'choice_1',
                  displayLabel: 'A',
                  textMd: 'Option A',
                  isCorrect: false,
                  explanationMd: null,
                },
                {
                  choiceId: 'choice_2',
                  displayLabel: 'B',
                  textMd: 'Option B',
                  isCorrect: true,
                  explanationMd: 'This is correct.',
                },
              ],
            },
          },
        }),
      );

    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: false,
        correctChoiceId: 'choice_2',
        explanationMd: 'Because',
        referenceMd: null,
        choiceExplanations: [
          {
            choiceId: 'choice_1',
            displayLabel: 'A',
            textMd: 'Option A',
            isCorrect: false,
            explanationMd: null,
          },
          {
            choiceId: 'choice_2',
            displayLabel: 'B',
            textMd: 'Option B',
            isCorrect: true,
            explanationMd: 'This is correct.',
          },
        ],
      }),
    );

    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(
      <PracticeSessionPageControllerNavigationProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
    await expect
      .element(screen.getByTestId('has-submit-result'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');

    await expect
      .element(screen.getByTestId('has-submit-result'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('submit-result-correct-choice-id'))
      .toHaveTextContent('choice_2');
    await expect
      .element(screen.getByTestId('submit-result-explanation-md'))
      .toHaveTextContent('Because');

    await screen.getByRole('button', { name: 'next-question' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
    await expect
      .element(screen.getByTestId('has-submit-result'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'navigate-question-1' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_1');
    await expect
      .element(screen.getByTestId('has-submit-result'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('submit-result-correct-choice-id'))
      .toHaveTextContent('choice_2');
    await expect
      .element(screen.getByTestId('submit-result-explanation-md'))
      .toHaveTextContent('Because');
  });

  it('locks selection when loading a previously answered question', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1, CHOICE_2],
        session: {
          sessionId: 'session-1',
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 2,
          isMarkedForReview: false,
          latestSelectedChoiceId: 'choice_2',
          latestIsCorrect: false,
        },
      }),
    );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_2');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await expect
      .element(screen.getByTestId('selected-choice-id'))
      .toHaveTextContent('choice_2');
  });
});
