import { useEffect, useMemo, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeQuestionFlow } from './use-practice-question-flow';

const {
  getBookmarksMock,
  toggleBookmarkMock,
  getNextQuestionMock,
  submitAnswerMock,
} = vi.hoisted(() => ({
  getBookmarksMock: vi.fn(),
  toggleBookmarkMock: vi.fn(),
  getNextQuestionMock: vi.fn(),
  submitAnswerMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', () => ({
  getBookmarks: getBookmarksMock,
  toggleBookmark: toggleBookmarkMock,
}));

vi.mock('@/src/adapters/controllers/question-controller', () => ({
  getNextQuestion: getNextQuestionMock,
  submitAnswer: submitAnswerMock,
}));

const TEST_FILTERS = { tagSlugs: [], difficulties: [] };

function PracticeQuestionFlowHookProbe() {
  const output = usePracticeQuestionFlow({ filters: TEST_FILTERS });

  const errorMessage =
    output.loadState.status === 'error' ? output.loadState.message : '';

  return (
    <>
      <div data-testid="load-status">{output.loadState.status}</div>
      <div data-testid="question-id">{output.question?.questionId ?? ''}</div>
      <div data-testid="bookmark-status">{output.bookmarkStatus}</div>
      <div data-testid="can-submit">{String(output.canSubmit)}</div>
      <div data-testid="error-message">{errorMessage}</div>
    </>
  );
}

function PracticeQuestionFlowBookmarkProbe() {
  const output = usePracticeQuestionFlow({ filters: TEST_FILTERS });
  const [bookmarkFeedbackCount, setBookmarkFeedbackCount] = useState(0);
  const bookmarkMessageVersion = (
    output as {
      bookmarkMessageVersion?: number;
    }
  ).bookmarkMessageVersion;
  const bookmarkFeedback = useMemo(
    () => ({
      message: output.bookmarkMessage,
      version: bookmarkMessageVersion ?? 0,
    }),
    [output.bookmarkMessage, bookmarkMessageVersion],
  );

  useEffect(() => {
    if (!bookmarkFeedback.message) return;
    setBookmarkFeedbackCount((prev) => prev + 1);
  }, [bookmarkFeedback]);

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

describe('usePracticeQuestionFlow (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads question data and transitions to ready state', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          slug: 'question-1',
          stemMd: 'What is the best next step?',
        }),
      ),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));

    const screen = await render(<PracticeQuestionFlowHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('q_1');
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('can-submit'))
      .toHaveTextContent('false');
  });

  it('transitions to error state when question loading throws', async () => {
    getNextQuestionMock.mockRejectedValue(new Error('Network down'));
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));

    const screen = await render(<PracticeQuestionFlowHookProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Network down');
  });

  it('emits bookmark feedback for repeated identical success messages', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok(
        createNextQuestion({
          slug: 'question-1',
          stemMd: 'What is the best next step?',
        }),
      ),
    );
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    toggleBookmarkMock.mockResolvedValue(ok({ bookmarked: true }));

    const screen = await render(<PracticeQuestionFlowBookmarkProbe />);

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
});
