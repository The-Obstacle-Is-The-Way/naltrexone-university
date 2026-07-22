import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import * as bookmarkController from '@/src/adapters/controllers/bookmark-controller';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeQuestionBookmarks } from './use-practice-question-bookmarks';

const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion2Id = crypto.randomUUID();

vi.mock('@/src/adapters/controllers/bookmark-controller', { spy: true });

const getBookmarkQuestionIds = vi.mocked(
  bookmarkController.getBookmarkQuestionIds,
);
const setBookmark = vi.mocked(bookmarkController.setBookmark);

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
      <div data-testid="is-bookmarked">
        {output.isBookmarked ? 'true' : 'false'}
      </div>
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
    getBookmarkQuestionIds.mockResolvedValue(ok({ questionIds: [] }));
    setBookmark.mockResolvedValue(ok({ bookmarked: true }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses a different bookmark idempotency key after moving to a different practice question following a failed toggle', async () => {
    setBookmark
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

    await expect.poll(() => setBookmark.mock.calls.length).toBe(1);
    const firstInput = setBookmark.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      questionId: string;
      bookmarked: boolean;
    };

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('error');

    await screen.getByRole('button', { name: 'set-question-2' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(fixtureQuestion2Id);

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();

    await expect.poll(() => setBookmark.mock.calls.length).toBe(2);
    const secondInput = setBookmark.mock.calls[1]?.[0] as {
      idempotencyKey: string;
      questionId: string;
      bookmarked: boolean;
    };

    expect(firstInput.questionId).toBe(fixtureQuestion1Id);
    expect(firstInput.bookmarked).toBe(true);
    expect(secondInput.questionId).toBe(fixtureQuestion2Id);
    expect(secondInput.bookmarked).toBe(true);
    expect(secondInput.idempotencyKey).not.toBe(firstInput.idempotencyKey);
  });

  it('sends bookmarked=false when removing a hydrated bookmarked practice question', async () => {
    getBookmarkQuestionIds.mockResolvedValue(
      ok({ questionIds: [fixtureQuestion1Id] }),
    );
    setBookmark.mockResolvedValue(ok({ bookmarked: false }));

    const screen = await render(<PracticeQuestionBookmarksProbe />);

    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
    expect(getBookmarkQuestionIds).toHaveBeenCalledWith({});

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();

    await expect.poll(() => setBookmark.mock.calls.length).toBe(1);
    expect(setBookmark).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      bookmarked: false,
      idempotencyKey: expect.any(String),
    });
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('false');
  });

  it('starts only one bookmark request per question when the toggle is invoked twice while pending', async () => {
    const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();
    setBookmark.mockReturnValue(deferred.promise);
    const screen = await render(<PracticeQuestionBookmarksProbe />);

    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await screen.getByRole('button', { name: 'toggle-bookmark' }).click();
    await expect.poll(() => setBookmark.mock.calls.length).toBeGreaterThan(0);

    deferred.resolve(ok({ bookmarked: true }));
    await deferred.promise;

    expect(setBookmark).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });
});
