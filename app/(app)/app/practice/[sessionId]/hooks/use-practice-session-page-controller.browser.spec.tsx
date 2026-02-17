import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeSessionPageController } from './use-practice-session-page-controller';

const {
  getNextQuestionMock,
  submitAnswerMock,
  getBookmarksMock,
  toggleBookmarkMock,
  getPracticeSessionReviewMock,
  endPracticeSessionMock,
  setPracticeSessionQuestionMarkMock,
} = vi.hoisted(() => ({
  getNextQuestionMock: vi.fn(),
  submitAnswerMock: vi.fn(),
  getBookmarksMock: vi.fn(),
  toggleBookmarkMock: vi.fn(),
  getPracticeSessionReviewMock: vi.fn(),
  endPracticeSessionMock: vi.fn(),
  setPracticeSessionQuestionMarkMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  getNextQuestion: getNextQuestionMock,
  submitAnswer: submitAnswerMock,
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', () => ({
  getBookmarks: getBookmarksMock,
  toggleBookmark: toggleBookmarkMock,
}));

vi.mock('@/src/adapters/controllers/practice-controller', () => ({
  getPracticeSessionReview: getPracticeSessionReviewMock,
  endPracticeSession: endPracticeSessionMock,
  setPracticeSessionQuestionMark: setPracticeSessionQuestionMarkMock,
}));

function PracticeSessionPageControllerHookProbe() {
  const output = usePracticeSessionPageController('session-1');
  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="is-pending">{String(output.isPending)}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="selected-choice-id">
        {output.selectedChoiceId ?? ''}
      </div>
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <div data-testid="error-message">{errorMessage}</div>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
    </>
  );
}

function PracticeSessionPageControllerNavigationProbe() {
  const output = usePracticeSessionPageController('session-1');

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="selected-choice-id">
        {output.selectedChoiceId ?? ''}
      </div>
      <div data-testid="has-submit-result">
        {String(output.submitResult !== null)}
      </div>
      <div data-testid="submit-result-correct-choice-id">
        {output.submitResult?.correctChoiceId ?? ''}
      </div>
      <div data-testid="submit-result-explanation-md">
        {output.submitResult?.explanationMd ?? ''}
      </div>
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
      <button type="button" onClick={() => output.onNextQuestion()}>
        next-question
      </button>
      <button
        type="button"
        onClick={() => output.onNavigateQuestion?.('question-1')}
      >
        navigate-question-1
      </button>
    </>
  );
}

function PracticeSessionPageControllerBookmarkProbe() {
  const output = usePracticeSessionPageController('session-1');
  const [bookmarkFeedbackCount, setBookmarkFeedbackCount] = useState(0);
  const bookmarkMessage = output.bookmarkMessage;
  const bookmarkMessageVersion = output.bookmarkMessageVersion ?? 0;

  useEffect(() => {
    if (!bookmarkMessage) return;
    if (bookmarkMessageVersion < 1) return;
    setBookmarkFeedbackCount((prev) => prev + 1);
  }, [bookmarkMessage, bookmarkMessageVersion]);

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="bookmark-feedback-count">{bookmarkFeedbackCount}</div>
      <button type="button" onClick={() => void output.onToggleBookmark()}>
        toggle-bookmark
      </button>
    </>
  );
}

function PracticeSessionPageControllerBookmarkPendingProbe() {
  const output = usePracticeSessionPageController('session-1');

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="is-pending">{String(output.isPending)}</div>
      <button type="button" onClick={() => void output.onToggleBookmark()}>
        toggle-bookmark
      </button>
    </>
  );
}

function PracticeSessionPageControllerReviewProbe() {
  const output = usePracticeSessionPageController('session-1');
  const activeView = output.review
    ? 'review'
    : output.question
      ? 'question'
      : '';

  return (
    <>
      <div data-testid="active-view">{activeView}</div>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="review-answered-count">
        {output.review ? String(output.review.answeredCount) : ''}
      </div>
      <div data-testid="review-row-answered">
        {output.review?.rows[0]?.isAnswered !== undefined
          ? String(output.review.rows[0].isAnswered)
          : ''}
      </div>
      <button type="button" onClick={() => output.onEndSession()}>
        review-answers
      </button>
      <button
        type="button"
        onClick={() => output.onOpenReviewQuestion?.('question-1')}
      >
        open-review-question-1
      </button>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
    </>
  );
}

function PracticeSessionPageControllerSubmitDuringReviewProbe() {
  const output = usePracticeSessionPageController('session-1');
  const activeView = output.review
    ? 'review'
    : output.question
      ? 'question'
      : '';

  return (
    <>
      <div data-testid="active-view">{activeView}</div>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
      </button>
      <button type="button" onClick={() => void output.onSubmit()}>
        submit-answer
      </button>
      <button type="button" onClick={() => output.onEndSession()}>
        review-answers
      </button>
    </>
  );
}

function PracticeSessionPageControllerMarkForReviewProbe() {
  const output = usePracticeSessionPageController('session-1');
  const isMarkedForReview = output.sessionInfo?.isMarkedForReview ?? null;

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="is-marking">{String(output.isMarkingForReview)}</div>
      <div data-testid="marked-for-review">
        {isMarkedForReview === null ? '' : String(isMarkedForReview)}
      </div>
      <button
        type="button"
        onClick={() => void output.onToggleMarkForReview?.()}
      >
        toggle-mark-for-review
      </button>
      <button type="button" onClick={() => output.onNextQuestion()}>
        next-question
      </button>
    </>
  );
}

describe('usePracticeSessionPageController (browser)', () => {
  afterEach(() => {
    getNextQuestionMock.mockReset();
    submitAnswerMock.mockReset();
    getBookmarksMock.mockReset();
    toggleBookmarkMock.mockReset();
    getPracticeSessionReviewMock.mockReset();
    endPracticeSessionMock.mockReset();
    setPracticeSessionQuestionMarkMock.mockReset();
  });

  it('loads the current question and allows selecting a choice', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok({
        questionId: 'question-1',
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        },
      }),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
        choiceExplanations: [],
      } satisfies SubmitAnswerOutput),
    );

    await expect
      .element(screen.getByTestId('is-pending'))
      .toHaveTextContent('false');
  });

  it('auto-advances in exam mode after a successful submit when more questions remain', async () => {
    getNextQuestionMock
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: {
            sessionId: 'session-1',
            mode: 'exam',
            index: 1,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      }),
    );
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: null,
        explanationMd: null,
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

    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(2);
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');
  });

  it('restores draft selections when navigating away and back before submit', async () => {
    getNextQuestionMock
      .mockResolvedValueOnce(
        ok({
          questionId: 'question-1',
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_2',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
      );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
            {
              id: 'choice_2',
              label: 'B',
              textMd: 'Option B',
              sortOrder: 2,
            },
          ],
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
          choices: [
            {
              id: 'choice_3',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
            {
              id: 'choice_2',
              label: 'B',
              textMd: 'Option B',
              sortOrder: 2,
            },
          ],
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

    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
          {
            id: 'choice_2',
            label: 'B',
            textMd: 'Option B',
            sortOrder: 2,
          },
        ],
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
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [],
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
        choices: [
          {
            id: 'choice_1',
            label: 'A',
            textMd: 'Option A',
            sortOrder: 1,
          },
        ],
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
    getPracticeSessionReviewMock
      .mockResolvedValueOnce(
        ok({
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 1,
          answeredCount: 0,
          markedCount: 0,
          rows: [
            {
              questionId: 'question-1',
              slug: 'question-1',
              order: 1,
              isAvailable: true,
              stemMd: 'Question 1',
              difficulty: 'easy',
              isAnswered: false,
              isCorrect: null,
              markedForReview: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 1,
          answeredCount: 0,
          markedCount: 0,
          rows: [
            {
              questionId: 'question-1',
              slug: 'question-1',
              order: 1,
              isAvailable: true,
              stemMd: 'Question 1',
              difficulty: 'easy',
              isAnswered: false,
              isCorrect: null,
              markedForReview: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({
          sessionId: 'session-1',
          mode: 'exam',
          totalCount: 1,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            {
              questionId: 'question-1',
              slug: 'question-1',
              order: 1,
              isAvailable: true,
              stemMd: 'Question 1',
              difficulty: 'easy',
              isAnswered: true,
              isCorrect: true,
              markedForReview: false,
            },
          ],
        }),
      );
    submitAnswerMock.mockResolvedValue(
      ok({
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: null,
        explanationMd: null,
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: {
            sessionId: 'session-1',
            mode: 'exam',
            index: 1,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: {
            sessionId: 'session-1',
            mode: 'exam',
            index: 1,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
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
          choices: [
            {
              id: 'choice_1',
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: {
            sessionId: 'session-1',
            mode: 'exam',
            index: 1,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    getPracticeSessionReviewMock.mockResolvedValue(
      ok({
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
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
