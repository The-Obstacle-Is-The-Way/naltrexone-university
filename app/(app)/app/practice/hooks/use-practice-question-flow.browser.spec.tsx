import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
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

function ok<T>(data: T) {
  return { ok: true as const, data };
}

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
});
