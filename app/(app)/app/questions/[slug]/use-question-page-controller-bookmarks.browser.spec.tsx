import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetBookmarksOutput } from '@/src/application/ports/bookmarks';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  getBookmarks,
  getPreviousAttempt,
  getQuestionBySlug,
  getQuestionPageQuestionIdForSlug,
  Probe,
  QUESTION_PAGE_ATTEMPT_1_ID,
  QUESTION_PAGE_CHOICE_1_ID,
  QUESTION_PAGE_QUESTION_1_ID,
  QUESTION_PAGE_QUESTION_2_ID,
  setupQuestionPageControllerBrowserSpec,
  toggleBookmark,
} from './use-question-page-controller-test-helpers';

setupQuestionPageControllerBrowserSpec();

describe('useQuestionPageController (browser)', () => {
  it('loads bookmark state for the current review question', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    getBookmarks.mockResolvedValue(
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: QUESTION_PAGE_QUESTION_1_ID,
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    expect(getBookmarks).toHaveBeenCalledWith({});
  });

  it('keeps bookmark state unhydrated until the bookmark lookup resolves', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    const deferred = createDeferred<ActionResult<GetBookmarksOutput>>();
    getBookmarks.mockReturnValue(deferred.promise);

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('loading');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('false');

    deferred.resolve(
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: QUESTION_PAGE_QUESTION_1_ID,
            slug: 'q-1',
            stemMd: 'Stem',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );
    await deferred.promise;

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });

  it('toggles bookmark state for the current review question', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    toggleBookmark.mockResolvedValue(ok({ bookmarked: true }));

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(1);
    expect(toggleBookmark).toHaveBeenCalledWith({
      questionId: QUESTION_PAGE_QUESTION_1_ID,
      idempotencyKey: expect.any(String),
    });
    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');
    await expect
      .element(screen.getByTestId('is-bookmarked'))
      .toHaveTextContent('true');
  });

  it('reports saving state while a bookmark toggle is in flight', async () => {
    getQuestionBySlug.mockResolvedValue(
      ok({
        questionId: QUESTION_PAGE_QUESTION_1_ID,
        slug: 'q-1',
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      }),
    );
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    const deferred = createDeferred<ActionResult<{ bookmarked: boolean }>>();
    toggleBookmark.mockReturnValue(deferred.promise);

    const screen = await render(<Probe mode="review" />);

    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('saving');

    deferred.resolve(ok({ bookmarked: true }));
    await deferred.promise;

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('idle');
  });

  it('uses a different bookmark idempotency key after moving to a different review question following a failed toggle', async () => {
    getQuestionBySlug.mockImplementation(async (input: unknown) => {
      const slug = (input as { slug: string }).slug;
      return ok({
        questionId: getQuestionPageQuestionIdForSlug(slug),
        slug,
        stemMd: 'Stem',
        difficulty: 'easy',
        choices: [
          { id: QUESTION_PAGE_CHOICE_1_ID, label: 'A', textMd: 'Choice A' },
        ],
      });
    });
    getPreviousAttempt.mockResolvedValue(
      ok({
        kind: 'attempt',
        sessionMode: null,
        attemptId: QUESTION_PAGE_ATTEMPT_1_ID,
        selectedChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        isOmitted: false,
        isCorrect: true,
        correctChoiceId: QUESTION_PAGE_CHOICE_1_ID,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
        answeredAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    toggleBookmark
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Boom' },
      })
      .mockResolvedValueOnce(ok({ bookmarked: true }));

    function Wrapper() {
      const [slug, setSlug] = useState('q-1');

      return (
        <>
          <Probe slug={slug} mode="review" />
          <button
            type="button"
            data-testid="set-slug-q-2"
            onClick={() => setSlug('q-2')}
          >
            Set slug q-2
          </button>
        </>
      );
    }

    const screen = await render(<Wrapper />);

    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-1');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(1);
    const firstInput = toggleBookmark.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    await expect
      .element(screen.getByTestId('bookmark-status'))
      .toHaveTextContent('error');

    await screen.getByTestId('set-slug-q-2').click();
    await expect
      .element(screen.getByTestId('question-slug'))
      .toHaveTextContent('q-2');
    await expect
      .element(screen.getByTestId('is-bookmark-hydrated'))
      .toHaveTextContent('true');

    await screen.getByTestId('trigger-toggle-bookmark').click();

    await expect.poll(() => toggleBookmark.mock.calls.length).toBe(2);
    const secondInput = toggleBookmark.mock.calls[1]?.[0] as {
      idempotencyKey: string;
      questionId: string;
    };

    expect(firstInput.questionId).toBe(QUESTION_PAGE_QUESTION_1_ID);
    expect(secondInput.questionId).toBe(QUESTION_PAGE_QUESTION_2_ID);
    expect(secondInput.idempotencyKey).not.toBe(firstInput.idempotencyKey);
  });
});
