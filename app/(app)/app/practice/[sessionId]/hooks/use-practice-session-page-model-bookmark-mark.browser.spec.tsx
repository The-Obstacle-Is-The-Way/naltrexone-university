import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';
import { createReviewResponse } from './practice-session-page-model.browser.fixtures';

import {
  BROWSER_QUESTION_1_ID,
  BROWSER_QUESTION_2_ID,
  BROWSER_SESSION_ID,
  CHOICE_1,
  getNextQuestionMock,
  mockBookmarksAndReview,
  PracticeSessionPageModelBookmarkPendingProbe,
  PracticeSessionPageModelBookmarkProbe,
  PracticeSessionPageModelMarkForReviewProbe,
  setPracticeSessionQuestionMarkMock,
  setupPracticeSessionPageModelBrowserSpec,
  toggleBookmarkMock,
} from './use-practice-session-page-model-test-helpers';

setupPracticeSessionPageModelBrowserSpec();

describe('usePracticeSessionPageModel (browser)', () => {
  it('emits bookmark feedback for repeated identical success messages', async () => {
    getNextQuestionMock.mockResolvedValue(
      ok({
        questionId: BROWSER_QUESTION_1_ID,
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1],
        session: {
          sessionId: BROWSER_SESSION_ID,
          mode: 'tutor',

          deadlineAt: null,

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

    const screen = await render(<PracticeSessionPageModelBookmarkProbe />);

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
        questionId: BROWSER_QUESTION_1_ID,
        slug: 'question-1',
        stemMd: 'Question 1',
        difficulty: 'easy',
        choices: [CHOICE_1],
        session: {
          sessionId: BROWSER_SESSION_ID,
          mode: 'tutor',

          deadlineAt: null,

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
      <PracticeSessionPageModelBookmarkPendingProbe />,
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
    await deferred.promise;
  });

  it('does not update mark-for-review UI state for the wrong question when navigating during the mark request', async () => {
    const deferred =
      createDeferred<
        ActionResult<{ questionId: string; markedForReview: boolean }>
      >();

    getNextQuestionMock
      .mockResolvedValueOnce(
        ok({
          questionId: BROWSER_QUESTION_1_ID,
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: BROWSER_SESSION_ID,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          questionId: BROWSER_QUESTION_2_ID,
          slug: 'question-2',
          stemMd: 'Question 2',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: BROWSER_SESSION_ID,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

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

    const screen = await render(<PracticeSessionPageModelMarkForReviewProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);
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
      .toHaveTextContent(BROWSER_QUESTION_2_ID);
    await expect
      .element(screen.getByTestId('marked-for-review'))
      .toHaveTextContent('false');

    deferred.resolve(
      ok({ questionId: BROWSER_QUESTION_1_ID, markedForReview: true }),
    );

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_2_ID);
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
          questionId: BROWSER_QUESTION_1_ID,
          slug: 'question-1',
          stemMd: 'Question 1',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: BROWSER_SESSION_ID,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          questionId: BROWSER_QUESTION_2_ID,
          slug: 'question-2',
          stemMd: 'Question 2',
          difficulty: 'easy',
          choices: [CHOICE_1],
          session: {
            sessionId: BROWSER_SESSION_ID,
            mode: 'exam',

            deadlineAt: '2099-05-22T12:02:24.000Z',

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

    const screen = await render(<PracticeSessionPageModelMarkForReviewProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);

    await screen
      .getByRole('button', { name: 'toggle-mark-for-review' })
      .click();
    await expect
      .poll(() => setPracticeSessionQuestionMarkMock.mock.calls.length)
      .toBe(1);

    await screen.getByRole('button', { name: 'next-question' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_2_ID);

    deferred.reject(new Error('Network timeout'));

    await expect
      .element(screen.getByTestId('is-marking'))
      .toHaveTextContent('false');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_2_ID);
  });
});
