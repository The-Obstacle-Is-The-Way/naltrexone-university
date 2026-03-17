import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeQuestionBookmarks } from './use-practice-question-bookmarks';

const { getBookmarksMock, toggleBookmarkMock } = vi.hoisted(() => ({
  getBookmarksMock: vi.fn(),
  toggleBookmarkMock: vi.fn(),
}));

vi.mock('@/src/adapters/controllers/bookmark-controller', () => ({
  getBookmarks: getBookmarksMock,
  toggleBookmark: toggleBookmarkMock,
}));

function PracticeQuestionBookmarksProbe() {
  const [question, setQuestion] = useState(
    createNextQuestion({
      questionId: 'question-1',
      slug: 'question-1',
    }),
  );
  const output = usePracticeQuestionBookmarks({
    question,
    isMounted: () => true,
  });

  return (
    <>
      <div data-testid="question-id">{question.questionId}</div>
      <div data-testid="bookmark-status">{output.bookmarkStatus}</div>
      <button type="button" onClick={() => void output.onToggleBookmark()}>
        toggle-bookmark
      </button>
      <button
        type="button"
        onClick={() =>
          setQuestion(
            createNextQuestion({
              questionId: 'question-2',
              slug: 'question-2',
            }),
          )
        }
      >
        set-question-2
      </button>
    </>
  );
}

describe('usePracticeQuestionBookmarks (browser)', () => {
  beforeEach(() => {
    getBookmarksMock.mockResolvedValue(ok({ rows: [] }));
    toggleBookmarkMock.mockResolvedValue(ok({ bookmarked: false }));
  });

  afterEach(() => {
    getBookmarksMock.mockReset();
    toggleBookmarkMock.mockReset();
  });

  it('uses a different bookmark idempotency key after moving to a different practice question following a failed toggle', async () => {
    toggleBookmarkMock
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Boom' },
      })
      .mockResolvedValueOnce(ok({ bookmarked: true }));

    const screen = await render(<PracticeQuestionBookmarksProbe />);

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-1');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();

    await expect.poll(() => toggleBookmarkMock.mock.calls.length).toBe(1);
    const firstInput = toggleBookmarkMock.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('error');

    await screen.getByRole('button', { name: 'set-question-2' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent('question-2');

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();

    await expect.poll(() => toggleBookmarkMock.mock.calls.length).toBe(2);
    const secondInput = toggleBookmarkMock.mock.calls[1]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    expect(firstInput.questionId).toBe('question-1');
    expect(secondInput.questionId).toBe('question-2');
    expect(secondInput.idempotencyKey).not.toBe(firstInput.idempotencyKey);
  });
});
