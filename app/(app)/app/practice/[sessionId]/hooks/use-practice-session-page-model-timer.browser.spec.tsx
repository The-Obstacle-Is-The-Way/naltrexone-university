import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';

import {
  createQuestionResponse,
  createReviewResponse,
} from './practice-session-page-model.browser.fixtures';
import {
  BROWSER_CHOICE_1_ID,
  BROWSER_QUESTION_1_ID,
  BROWSER_SESSION_ID,
  CHOICE_1,
  CHOICE_2,
  CHOICE_3,
  errorResult,
  finalizeExamAnswersMock,
  getNextQuestionMock,
  getPracticeSessionSummaryMock,
  mockBookmarksAndReview,
  PracticeSessionPageModelNavigationProbe,
  PracticeSessionPageModelReviewProbe,
  saveExamDraftAnswerMock,
  setupPracticeSessionPageModelBrowserSpec,
} from './use-practice-session-page-model-test-helpers';

setupPracticeSessionPageModelBrowserSpec();

function mockActiveTimedExam(deadlineAt: string) {
  getPracticeSessionSummaryMock.mockResolvedValue(
    errorResult('CONFLICT', 'Practice session has not ended'),
  );
  getNextQuestionMock.mockResolvedValue(
    ok(
      createQuestionResponse({
        questionId: BROWSER_QUESTION_1_ID,
        choices: [CHOICE_1, CHOICE_2, CHOICE_3],
        session: {
          mode: 'exam',
          deadlineAt,
          index: 0,
          total: 1,
          isMarkedForReview: false,
        },
      }),
    ),
  );
  mockBookmarksAndReview(
    createReviewResponse({
      mode: 'exam',
      totalCount: 1,
      answeredCount: 0,
      markedCount: 0,
    }),
  );
}

function hasSelectedFinalDraft(input: unknown): boolean {
  const finalDraftAnswer =
    typeof input === 'object' && input !== null && 'finalDraftAnswer' in input
      ? (
          input as {
            finalDraftAnswer?: {
              questionId?: unknown;
              selectedChoiceId?: unknown;
            };
          }
        ).finalDraftAnswer
      : null;

  return (
    finalDraftAnswer?.questionId === BROWSER_QUESTION_1_ID &&
    finalDraftAnswer.selectedChoiceId === BROWSER_CHOICE_1_ID
  );
}

function mockFinalizeSummary(input: { answered?: number } = {}) {
  const answered = input.answered ?? 0;
  finalizeExamAnswersMock.mockResolvedValue(
    ok({
      sessionId: BROWSER_SESSION_ID,
      endedAt: '2026-05-22T12:01:12.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: {
        answered,
        correct: 0,
        accuracy: 0,
        durationSeconds: 72,
      },
    }),
  );
}

function mockFinalizeSummaryFromFinalFlush() {
  finalizeExamAnswersMock.mockImplementation(async (input: unknown) => {
    const answered = hasSelectedFinalDraft(input) ? 1 : 0;
    return ok({
      sessionId: BROWSER_SESSION_ID,
      endedAt: '2026-05-22T12:01:12.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: {
        answered,
        correct: 0,
        accuracy: 0,
        durationSeconds: 72,
      },
    });
  });
}

describe('usePracticeSessionPageModel timer expiry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('grades a locally selected exam answer when timer expiry final draft save is rejected', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:01.000Z');
    mockFinalizeSummaryFromFinalFlush();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired', {
        reason: 'exam_time_expired',
      }),
    );

    const screen = await render(<PracticeSessionPageModelReviewProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();

    await vi.advanceTimersByTimeAsync(1_000);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-answered-count'))
      .toHaveTextContent('1');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledTimes(1);
    expect(saveExamDraftAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: BROWSER_QUESTION_1_ID,
        selectedChoiceId: BROWSER_CHOICE_1_ID,
      }),
    );
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finalDraftAnswer: expect.objectContaining({
          questionId: BROWSER_QUESTION_1_ID,
          selectedChoiceId: BROWSER_CHOICE_1_ID,
        }),
      }),
    );

    await vi.advanceTimersByTimeAsync(3_000);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
  });

  it('manual Review & Submit after expiry proceeds to finalization after a rejected draft save', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:01.000Z');
    mockFinalizeSummary();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired', {
        reason: 'exam_time_expired',
      }),
    );

    const screen = await render(<PracticeSessionPageModelReviewProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();
    vi.setSystemTime(new Date('2026-05-22T12:00:02.000Z'));

    await screen.getByRole('button', { name: 'review-answers' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
  });

  it('manual Review & Submit trusts a server-expired draft save when the browser clock is behind', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:30.000Z');
    mockFinalizeSummaryFromFinalFlush();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired', {
        reason: 'exam_time_expired',
      }),
    );

    const screen = await render(<PracticeSessionPageModelReviewProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();

    await screen.getByRole('button', { name: 'review-answers' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-answered-count'))
      .toHaveTextContent('1');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finalDraftAnswer: expect.objectContaining({
          questionId: BROWSER_QUESTION_1_ID,
          selectedChoiceId: BROWSER_CHOICE_1_ID,
        }),
      }),
    );
  });

  it('next-question trusts a server-expired draft save when the browser clock is behind', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:30.000Z');
    mockFinalizeSummaryFromFinalFlush();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired', {
        reason: 'exam_time_expired',
      }),
    );

    const screen = await render(<PracticeSessionPageModelNavigationProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();

    await screen.getByRole('button', { name: 'next-question' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-answered-count'))
      .toHaveTextContent('1');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finalDraftAnswer: expect.objectContaining({
          questionId: BROWSER_QUESTION_1_ID,
          selectedChoiceId: BROWSER_CHOICE_1_ID,
        }),
      }),
    );
    expect(getNextQuestionMock).toHaveBeenCalledTimes(1);
  });

  it('explicit navigation trusts a server-expired draft save when the browser clock is behind', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:30.000Z');
    mockFinalizeSummaryFromFinalFlush();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired', {
        reason: 'exam_time_expired',
      }),
    );

    const screen = await render(<PracticeSessionPageModelNavigationProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();

    await screen.getByRole('button', { name: 'navigate-question-1' }).click();

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    await expect
      .element(screen.getByTestId('summary-answered-count'))
      .toHaveTextContent('1');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finalDraftAnswer: expect.objectContaining({
          questionId: BROWSER_QUESTION_1_ID,
          selectedChoiceId: BROWSER_CHOICE_1_ID,
        }),
      }),
    );
    expect(getNextQuestionMock).toHaveBeenCalledTimes(1);
  });
});
