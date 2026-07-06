import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  PracticeSessionConflictMessages,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { ok } from '@/tests/test-helpers/ok';

import {
  createQuestionResponse,
  createReviewResponse,
  createReviewRow,
} from './practice-session-page-model.browser.fixtures';
import {
  BROWSER_QUESTION_1_ID,
  BROWSER_QUESTION_2_ID,
  BROWSER_SESSION_ID,
  errorResult,
  getNextQuestionMock,
  getPracticeSessionReviewMock,
  getPracticeSessionSummaryMock,
  PracticeSessionPageModelNavigationProbe,
  PracticeSessionPageModelSummaryProbe,
  setupPracticeSessionPageModelBrowserSpec,
  submitAnswerMock,
} from './use-practice-session-page-model-test-helpers';

setupPracticeSessionPageModelBrowserSpec();

function mockTutorSummary() {
  return ok({
    sessionId: BROWSER_SESSION_ID,
    endedAt: '2026-02-07T00:20:00.000Z',
    mode: 'tutor' as const,
    questionCount: 2,
    totals: {
      answered: 1,
      correct: 1,
      accuracy: 0.5,
      durationSeconds: 1200,
    },
  });
}

function mockTutorReview() {
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
}

function alreadyEndedConflict() {
  return errorResult('CONFLICT', PracticeSessionConflictMessages.AlreadyEnded, {
    reason: PracticeSessionConflictReasons.AlreadyEnded,
  });
}

function mockActiveTutorQuestionThenEndedConflict() {
  getNextQuestionMock
    .mockResolvedValueOnce(
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
    )
    .mockResolvedValue(alreadyEndedConflict());
}

describe('usePracticeSessionPageModel ended-session conflict recovery', () => {
  it('shows the summary when loading a tutor question reports an AlreadyEnded conflict', async () => {
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockResolvedValueOnce(mockTutorSummary());
    getNextQuestionMock.mockResolvedValue(alreadyEndedConflict());
    mockTutorReview();

    const screen = await render(<PracticeSessionPageModelSummaryProbe />);

    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-mode'))
      .toHaveTextContent('tutor');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent('');
  });

  it('keeps the generic load error when ended-session recovery still reports an active session', async () => {
    getPracticeSessionSummaryMock.mockResolvedValue(
      errorResult('CONFLICT', 'Practice session has not ended'),
    );
    getNextQuestionMock.mockResolvedValue(alreadyEndedConflict());

    const screen = await render(<PracticeSessionPageModelSummaryProbe />);

    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent(PracticeSessionConflictMessages.AlreadyEnded);
  });

  it('keeps the generic load error when ended-session recovery summary re-read throws', async () => {
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockRejectedValueOnce(new Error('Summary recovery failed'));
    getNextQuestionMock.mockResolvedValue(alreadyEndedConflict());

    const screen = await render(<PracticeSessionPageModelSummaryProbe />);

    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(1);
    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('');
    await expect
      .element(screen.getByTestId('load-status'))
      .toHaveTextContent('error');
    await expect
      .element(screen.getByTestId('error-message'))
      .toHaveTextContent(PracticeSessionConflictMessages.AlreadyEnded);
  });

  it('shows the summary when tutor answer submit reports an AlreadyEnded conflict', async () => {
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockResolvedValueOnce(mockTutorSummary());
    mockActiveTutorQuestionThenEndedConflict();
    submitAnswerMock.mockResolvedValue(alreadyEndedConflict());
    mockTutorReview();

    const screen = await render(<PracticeSessionPageModelNavigationProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();

    await expect.poll(() => submitAnswerMock.mock.calls.length > 0).toBe(true);
    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);
    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-answered-count'))
      .toHaveTextContent('1');
  });

  it('deduplicates concurrent ended-session summary recovery requests', async () => {
    const recoverySummary = createDeferred<ActionResult<unknown>>();
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockImplementation(() => recoverySummary.promise);
    mockActiveTutorQuestionThenEndedConflict();
    submitAnswerMock.mockResolvedValue(alreadyEndedConflict());
    mockTutorReview();

    const screen = await render(<PracticeSessionPageModelNavigationProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();
    await screen.getByRole('button', { name: 'next-question' }).click();

    await expect.poll(() => submitAnswerMock.mock.calls.length).toBe(1);
    await expect.poll(() => getNextQuestionMock.mock.calls.length).toBe(2);
    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);

    recoverySummary.resolve(mockTutorSummary());

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    expect(getPracticeSessionSummaryMock).toHaveBeenCalledTimes(2);
  });

  it('does not let stale ended-session recovery overwrite a newer question load', async () => {
    const recoverySummary = createDeferred<ActionResult<unknown>>();
    getPracticeSessionSummaryMock
      .mockResolvedValueOnce(
        errorResult('CONFLICT', 'Practice session has not ended'),
      )
      .mockImplementation(() => recoverySummary.promise);
    getNextQuestionMock
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(
        ok(
          createQuestionResponse({
            questionId: BROWSER_QUESTION_2_ID,
            session: {
              mode: 'tutor',
              deadlineAt: null,
              index: 1,
              total: 2,
              isMarkedForReview: false,
            },
          }),
        ),
      );
    submitAnswerMock.mockResolvedValue(alreadyEndedConflict());
    mockTutorReview();

    const screen = await render(<PracticeSessionPageModelNavigationProbe />);

    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_1_ID);
    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    await screen.getByRole('button', { name: 'submit-answer' }).click();
    await expect
      .poll(() => getPracticeSessionSummaryMock.mock.calls.length)
      .toBe(2);

    await screen.getByRole('button', { name: 'next-question' }).click();
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_2_ID);

    recoverySummary.resolve(mockTutorSummary());

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await expect
      .element(screen.getByTestId('question-id'))
      .toHaveTextContent(BROWSER_QUESTION_2_ID);
  });
});
