import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type {
  ActionErrorCode,
  ActionResult,
} from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import {
  createChoice,
  createQuestionResponse,
  createReviewResponse,
  createReviewRow,
} from './practice-session-page-controller.browser.fixtures';
import {
  getPracticeSessionPageControllerBrowserMocks,
  resetPracticeSessionPageControllerBrowserMocks,
} from './practice-session-page-controller.browser.setup';

let PracticeSessionPageControllerBookmarkPendingProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerBookmarkPendingProbe;
let PracticeSessionPageControllerBookmarkProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerBookmarkProbe;
let PracticeSessionPageControllerHookProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerHookProbe;
let PracticeSessionPageControllerMarkForReviewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerMarkForReviewProbe;
let PracticeSessionPageControllerNavigationProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerNavigationProbe;
let PracticeSessionPageControllerReviewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerReviewProbe;
let PracticeSessionPageControllerSummaryProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerSummaryProbe;
let PracticeSessionPageControllerSubmitDuringReviewProbe: typeof import('./practice-session-page-controller.browser.probes').PracticeSessionPageControllerSubmitDuringReviewProbe;

const {
  getNextQuestionMock,
  submitAnswerMock,
  getBookmarksMock,
  toggleBookmarkMock,
  getPracticeSessionReviewMock,
  getPracticeSessionSummaryMock,
  endPracticeSessionMock,
  finalizeExamAnswersMock,
  saveExamDraftAnswerMock,
  setPracticeSessionQuestionMarkMock,
} = getPracticeSessionPageControllerBrowserMocks();

beforeAll(async () => {
  const probes = await import(
    './practice-session-page-controller.browser.probes'
  );
  PracticeSessionPageControllerBookmarkPendingProbe =
    probes.PracticeSessionPageControllerBookmarkPendingProbe;
  PracticeSessionPageControllerBookmarkProbe =
    probes.PracticeSessionPageControllerBookmarkProbe;
  PracticeSessionPageControllerHookProbe =
    probes.PracticeSessionPageControllerHookProbe;
  PracticeSessionPageControllerMarkForReviewProbe =
    probes.PracticeSessionPageControllerMarkForReviewProbe;
  PracticeSessionPageControllerNavigationProbe =
    probes.PracticeSessionPageControllerNavigationProbe;
  PracticeSessionPageControllerReviewProbe =
    probes.PracticeSessionPageControllerReviewProbe;
  PracticeSessionPageControllerSummaryProbe =
    probes.PracticeSessionPageControllerSummaryProbe;
  PracticeSessionPageControllerSubmitDuringReviewProbe =
    probes.PracticeSessionPageControllerSubmitDuringReviewProbe;
});

const EMPTY_BOOKMARKS_RESULT = ok({ rows: [] });
const CHOICE_1 = createChoice({ id: 'choice_1' });
const CHOICE_2 = createChoice({
  id: 'choice_2',
  label: 'B',
  textMd: 'Option B',
  sortOrder: 2,
});
const CHOICE_3 = createChoice({
  id: 'choice_3',
  label: 'C',
  textMd: 'Option C',
  sortOrder: 3,
});

function mockBookmarksAndReview(
  review: ReturnType<typeof createReviewResponse>,
) {
  getBookmarksMock.mockResolvedValue(EMPTY_BOOKMARKS_RESULT);
  getPracticeSessionReviewMock.mockResolvedValue(ok(review));
}

function errorResult(
  code: ActionErrorCode,
  message: string,
): ActionResult<never> {
  return {
    ok: false,
    error: { code, message },
  };
}

describe('usePracticeSessionPageController (browser)', () => {
  beforeEach(() => {
    getPracticeSessionSummaryMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );
    getBookmarksMock.mockResolvedValue(EMPTY_BOOKMARKS_RESULT);
    saveExamDraftAnswerMock.mockImplementation(async (input) =>
      ok({
        questionId:
          typeof input === 'object' &&
          input &&
          'questionId' in input &&
          typeof input.questionId === 'string'
            ? input.questionId
            : 'question-1',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId:
          typeof input === 'object' &&
          input &&
          'selectedChoiceId' in input &&
          typeof input.selectedChoiceId === 'string'
            ? input.selectedChoiceId
            : 'choice_1',
        draftSavedAt: new Date('2026-02-07T00:00:00.000Z'),
        draftCumulativeMs:
          typeof input === 'object' &&
          input &&
          'cumulativeMs' in input &&
          typeof input.cumulativeMs === 'number'
            ? input.cumulativeMs
            : 1_000,
      }),
    );
  });

  afterEach(() => {
    resetPracticeSessionPageControllerBrowserMocks();
  });

  it('bootstraps an ended tutor session into summary without loading a question', async () => {
    getNextQuestionMock.mockImplementation(async () => {
      throw new Error('getNextQuestion should not be called');
    });
    getPracticeSessionSummaryMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'tutor',
        questionCount: 2,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok(
        createReviewResponse({
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 0,
          rows: [createReviewRow({ questionId: 'question-1', order: 1 })],
        }),
      ),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-mode'))
      .toHaveTextContent('tutor');
    await expect
      .element(screen.getByTestId('summary-session-id'))
      .toHaveTextContent('session-1');
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
  });

  it('bootstraps an ended exam session into summary without loading a question', async () => {
    getNextQuestionMock.mockImplementation(async () => {
      throw new Error('getNextQuestion should not be called');
    });
    getPracticeSessionSummaryMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 0,
          accuracy: 0,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok(
        createReviewResponse({
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [createReviewRow({ questionId: 'question-1', order: 1 })],
        }),
      ),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-mode'))
      .toHaveTextContent('exam');
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
  });

  it('loads active session questions only after summary bootstrap reports an active session', async () => {
    const callOrder: string[] = [];
    const deferredSummary = createDeferred<ActionResult<never>>();

    getPracticeSessionSummaryMock.mockImplementation(() => {
      callOrder.push('summary');
      return deferredSummary.promise;
    });
    getNextQuestionMock.mockImplementation(async () => {
      callOrder.push('question');
      return ok(
        createQuestionResponse({
          questionId: 'question-1',
          session: {
            mode: 'tutor',
            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    });
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(1);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('');

    deferredSummary.resolve(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
    expect(callOrder).toEqual(['summary', 'question']);
  });

  it('saves the current exam draft before moving to the next question', async () => {
    getNextQuestionMock
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(
        ok(
          createQuestionResponse({
            questionId: 'question-2',
            choices: [CHOICE_1, CHOICE_2, CHOICE_3],
            session: {
              mode: 'exam',
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
      .toHaveTextContent('summary');
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(endPracticeSessionMock).not.toHaveBeenCalled();
  });

  it('recovers a summary when ending an active tutor session returns CONFLICT', async () => {
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockResolvedValueOnce(
        ok({
          sessionId: 'session-1',
          endedAt: '2026-02-07T00:20:00.000Z',
          mode: 'tutor',
          questionCount: 2,
          totals: {
            answered: 1,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 1200,
          },
        }),
      );
    getNextQuestionMock.mockResolvedValue(
      ok(
        createQuestionResponse({
          questionId: 'question-1',
          session: {
            mode: 'tutor',
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
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 0,
          rows: [createReviewRow({ questionId: 'question-1', order: 1 })],
        }),
      ),
    );
    endPracticeSessionMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session already ended'),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');

    await screen.getByRole('button', { name: 'end-session' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-session-id'))
      .toHaveTextContent('session-1');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('');
  });

  it('retries summary bootstrap before loading questions after a bootstrap error', async () => {
    const deferredRetrySummary = createDeferred<ActionResult<never>>();

    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('INTERNAL_ERROR', 'Summary bootstrap failed'),
      )
      .mockImplementationOnce(() => deferredRetrySummary.promise);
    getNextQuestionMock.mockResolvedValue(
      ok(
        createQuestionResponse({
          questionId: 'question-1',
          session: {
            mode: 'tutor',
            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      ),
    );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Summary bootstrap failed');
    expect(getPracticeSessionSummaryMock).toHaveBeenCalledTimes(1);
    expect(getNextQuestionMock).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'try-again' }).click();

    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('loading');

    deferredRetrySummary.resolve(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
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

  it('transitions to error when question loading throws', async () => {
    getNextQuestionMock.mockRejectedValue(new Error('Question load failed'));
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'exam',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Question load failed');
  });

  it('emits bookmark feedback for repeated identical success messages', async () => {
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
    toggleBookmarkMock.mockResolvedValue(ok({ bookmarked: true }));

    const screen = await render(<PracticeSessionPageControllerBookmarkProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await expect
      .element(screen.getByTestId('bookmark-feedback-count'))
      .toHaveTextContent('1');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await expect
      .element(screen.getByTestId('bookmark-feedback-count'))
      .toHaveTextContent('2');
  });

  it('does not set transition pending state when toggling bookmarks', async () => {
    const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();

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
    toggleBookmarkMock.mockImplementation(async () => deferred.promise);

    const screen = await render(
      <PracticeSessionPageControllerBookmarkPendingProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');

    deferred.resolve(ok({ bookmarked: true }));
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

  it('does not auto-advance in exam mode after a successful submit when more questions remain', async () => {
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
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('true');
    await screen.getByRole('button', { name: 'submit-answer' }).click();

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
    getPracticeSessionReviewMock
      .mockResolvedValueOnce(
        ok(
          createReviewResponse({
            mode: 'exam',
            totalCount: 1,
            answeredCount: 0,
            markedCount: 0,
            rows: [unansweredRow],
          }),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          createReviewResponse({
            mode: 'exam',
            totalCount: 1,
            answeredCount: 0,
            markedCount: 0,
            rows: [unansweredRow],
          }),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          createReviewResponse({
            mode: 'exam',
            totalCount: 1,
            answeredCount: 1,
            markedCount: 0,
            rows: [answeredRow],
          }),
        ),
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

  it('does not update mark-for-review UI state for the wrong question when navigating during the mark request', async () => {
    const deferred =
      createDeferred<
        ActionResult<{ questionId: string; markedForReview: boolean }>
      >();

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
    setPracticeSessionQuestionMarkMock.mockImplementation(
      async () => deferred.promise,
    );

    const screen = await render(
      <PracticeSessionPageControllerMarkForReviewProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');
    await expect
      .element(screen.getByTestId('marked-for-review'))
      .toHaveTextContent('false');

    await screen
      .getByRole('button', { name: 'toggle-mark-for-review' })
      .click();
    await expect
      .poll(() => setPracticeSessionQuestionMarkMock.mock.calls.length)
      .toBe(1);
    await expect
      .element(screen.getByTestId('is-marking'))
      .toHaveTextContent('true');
    await screen.getByRole('button', { name: 'next-question' }).click();

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
    await expect
      .element(screen.getByTestId('marked-for-review'))
      .toHaveTextContent('false');

    deferred.resolve(ok({ questionId: 'question-1', markedForReview: true }));

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
    await expect
      .element(screen.getByTestId('is-marking'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('marked-for-review'))
      .toHaveTextContent('false');
  });

  it('does not show an error on the wrong question when a mark-for-review request fails after navigating away', async () => {
    const deferred =
      createDeferred<
        ActionResult<{ questionId: string; markedForReview: boolean }>
      >();

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
    setPracticeSessionQuestionMarkMock.mockImplementation(
      async () => deferred.promise,
    );

    const screen = await render(
      <PracticeSessionPageControllerMarkForReviewProbe />,
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen
      .getByRole('button', { name: 'toggle-mark-for-review' })
      .click();
    await expect
      .poll(() => setPracticeSessionQuestionMarkMock.mock.calls.length)
      .toBe(1);

    await screen.getByRole('button', { name: 'next-question' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');

    deferred.reject(new Error('Network timeout'));

    await expect
      .element(screen.getByTestId('is-marking'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
  });
});
