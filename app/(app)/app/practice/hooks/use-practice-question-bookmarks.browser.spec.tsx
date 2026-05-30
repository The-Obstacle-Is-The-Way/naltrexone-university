import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeQuestionBookmarks } from './use-practice-question-bookmarks';

const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();

vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });

const getBookmarks = vi.mocked(bookmarkController.getBookmarks);
const toggleBookmark = vi.mocked(bookmarkController.toggleBookmark);

function PracticeQuestionBookmarksProbe() {
  const [question, setQuestion] = useState(
    createNextQuestion({
      questionId: fixtureQuestion1Id,
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
              questionId: fixtureQuestion2Id,
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
    getBookmarks.mockResolvedValue(ok({ rows: [] }));
    toggleBookmark.mockResolvedValue(ok({ bookmarked: false }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses a different bookmark idempotency key after moving to a different practice question following a failed toggle', async () => {
    toggleBookmark
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Boom' },
      })
      .mockResolvedValueOnce(ok({ bookmarked: true }));

    const screen = await render(<PracticeQuestionBookmarksProbe />);

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(fixtureQuestion1Id);

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(1);
    const firstInput = toggleBookmark.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('error');

    await screen.getByRole('button', { name: 'set-question-2' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(fixtureQuestion2Id);

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(2);
    const secondInput = toggleBookmark.mock.calls[1]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    expect(firstInput.questionId).toBe(fixtureQuestion1Id);
    expect(secondInput.questionId).toBe(fixtureQuestion2Id);
    expect(secondInput.idempotencyKey).not.toBe(firstInput.idempotencyKey);
  });
});
