import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
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

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function PracticeSessionPageControllerHookProbe() {
  const output = usePracticeSessionPageController('session-1');
  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="selected-choice-id">
        {output.selectedChoiceId ?? ''}
      </div>
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <div data-testid="error-message">{errorMessage}</div>
      <button type="button" onClick={() => output.onSelectChoice('choice_1')}>
        select-choice-1
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
});
