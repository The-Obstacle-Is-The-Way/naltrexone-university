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
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
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

describe('usePracticeSessionPageController (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
