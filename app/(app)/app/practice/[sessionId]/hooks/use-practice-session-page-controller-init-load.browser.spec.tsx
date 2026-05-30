import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  createQuestionResponse,
  createReviewResponse,
  createReviewRow,
} from './practice-session-page-controller.browser.fixtures';
import {
  BROWSER_QUESTION_1_ID,
  BROWSER_SESSION_ID,
  endPracticeSessionMock,
  errorResult,
  getNextQuestionMock,
  getPracticeSessionReviewMock,
  getPracticeSessionSummaryMock,
  mockBookmarksAndReview,
  PracticeSessionPageControllerHookProbe,
  PracticeSessionPageControllerSummaryProbe,
  setupPracticeSessionPageControllerBrowserSpec,
} from './use-practice-session-page-controller-test-helpers';

setupPracticeSessionPageControllerBrowserSpec();

describe('usePracticeSessionPageController (browser)', () => {
  it('bootstraps an ended tutor session into summary without loading a question', async () => {
    getNextQuestionMock.mockImplementation(async () => {
      throw new Error('getNextQuestion should not be called');
    });
    getPracticeSessionSummaryMock.mockResolvedValue(
      ok({
        sessionId: BROWSER_SESSION_ID,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'tutor',
        questionCount: 2,
        totals: {
          answered: 1,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok(
        createReviewResponse({
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            createReviewRow({ questionId: BROWSER_QUESTION_1_ID, order: 1 }),
          ],
        }),
      ),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-mode'))
      .toHaveTextContent('tutor');
    await expect
      .element(screen.getByTestId('summary-session-id'))
      .toHaveTextContent(BROWSER_SESSION_ID);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
  });

  it('bootstraps an ended exam session into summary without loading a question', async () => {
    getNextQuestionMock.mockImplementation(async () => {
      throw new Error('getNextQuestion should not be called');
    });
    getPracticeSessionSummaryMock.mockResolvedValue(
      ok({
        sessionId: BROWSER_SESSION_ID,
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 0,
          accuracy: 0,
          durationSeconds: 1200,
        },
      }),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok(
        createReviewResponse({
          mode: 'exam',
          totalCount: 2,
          answeredCount: 2,
          markedCount: 0,
          rows: [
            createReviewRow({ questionId: BROWSER_QUESTION_1_ID, order: 1 }),
          ],
        }),
      ),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-mode'))
      .toHaveTextContent('exam');
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
  });

  it('loads active session questions only after summary bootstrap reports an active session', async () => {
    const callOrder: string[] = [];
    const deferredSummary = createDeferred<ActionResult<never>>();

    getPracticeSessionSummaryMock.mockImplementation(() => {
      callOrder.push('summary');
      return deferredSummary.promise;
    });
    getNextQuestionMock.mockImplementation(async () => {
      callOrder.push('question');
      return ok(
        createQuestionResponse({
          questionId: BROWSER_QUESTION_1_ID,
          session: {
            mode: 'tutor',

            deadlineAt: null,

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      );
    });
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(1);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('');

    deferredSummary.resolve(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);
    expect(callOrder).toEqual(['summary', 'question']);
  });

  it('recovers a summary when ending an active tutor session returns CONFLICT', async () => {
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockResolvedValueOnce(
        ok({
          sessionId: BROWSER_SESSION_ID,
          endedAt: '2026-02-07T00:20:00.000Z',
          mode: 'tutor',
          questionCount: 2,
          totals: {
            answered: 1,
            correct: 1,
            accuracy: 0.5,
            durationSeconds: 1200,
          },
        }),
      );
    getNextQuestionMock.mockResolvedValue(
      ok(
        createQuestionResponse({
          questionId: BROWSER_QUESTION_1_ID,
          session: {
            mode: 'tutor',

            deadlineAt: null,

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      ),
    );
    getPracticeSessionReviewMock.mockResolvedValue(
      ok(
        createReviewResponse({
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 1,
          markedCount: 0,
          rows: [
            createReviewRow({ questionId: BROWSER_QUESTION_1_ID, order: 1 }),
          ],
        }),
      ),
    );
    endPracticeSessionMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session already ended'),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');

    await screen.getByRole('button', { name: 'end-session' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-session-id'))
      .toHaveTextContent(BROWSER_SESSION_ID);
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('');
  });

  it('retries summary bootstrap before loading questions after a bootstrap error', async () => {
    const deferredRetrySummary = createDeferred<ActionResult<never>>();

    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('INTERNAL_ERROR', 'Summary bootstrap failed'),
      )
      .mockImplementationOnce(() => deferredRetrySummary.promise);
    getNextQuestionMock.mockResolvedValue(
      ok(
        createQuestionResponse({
          questionId: BROWSER_QUESTION_1_ID,
          session: {
            mode: 'tutor',

            deadlineAt: null,

            index: 0,
            total: 2,
            isMarkedForReview: false,
          },
        }),
      ),
    );
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
      }),
    );

    const screen = await render(<PracticeSessionPageControllerSummaryProbe />);

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('Summary bootstrap failed');
    expect(getPracticeSessionSummaryMock).toHaveBeenCalledTimes(1);
    expect(getNextQuestionMock).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'try-again' }).click();

    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(0);
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('loading');

    deferredRetrySummary.resolve(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );

    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('ready');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
  });

  it('sets error state and enables retry when bootstrap summary times out', async () => {
    vi.useFakeTimers();
    try {
      const deferredSummary = createDeferred<ActionResult<never>>();

      getPracticeSessionSummaryMock
        .mockImplementationOnce(() => deferredSummary.promise)
        .mockResolvedValueOnce(
          errorResult('CONFLICT', 'Practice session has not ended'),
        );
      getNextQuestionMock.mockResolvedValue(
        ok(
          createQuestionResponse({
            questionId: BROWSER_QUESTION_1_ID,
            session: {
              mode: 'tutor',

              deadlineAt: null,

              index: 0,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      );
      mockBookmarksAndReview(
        createReviewResponse({
          mode: 'tutor',
          totalCount: 2,
          answeredCount: 0,
          markedCount: 0,
        }),
      );

      const screen = await render(
        <PracticeSessionPageControllerSummaryProbe />,
      );

      await expect
        .element(screen.getByTestId('load-status'))
        .toHaveTextContent('loading');
      expect(getPracticeSessionSummaryMock).toHaveBeenCalledTimes(1);
      expect(getNextQuestionMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(STANDARD_READ_TIMEOUT_MS);

      await expect
        .element(screen.getByTestId('load-status'))
        .toHaveTextContent('error');
      await expect
        .element(screen.getByTestId('error-message'))
        .toHaveTextContent('Request timed out. Please try again.');
      expect(getNextQuestionMock).not.toHaveBeenCalled();

      await screen.getByRole('button', { name: 'try-again' }).click();

      await expect
        .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
        .toBe(2);
      await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
      await expect
        .element(screen.getByTestId('load-status'))
        .toHaveTextContent('ready');
      await expect
        .element(screen.getByTestId('question-id'))
        .toHaveTextContent(BROWSER_QUESTION_1_ID);
    } finally {
      vi.useRealTimers();
    }
  });

  it('transitions to error when question loading throws', async () => {
    getNextQuestionMock.mockRejectedValue(new Error('Question load failed'));
    mockBookmarksAndReview(
      createReviewResponse({
        mode: 'exam',
        totalCount: 10,
        answeredCount: 0,
        markedCount: 0,
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
