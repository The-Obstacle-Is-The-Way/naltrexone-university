import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import {
  createQuestionResponse,
  createReviewResponse,
} from './practice-session-page-controller.browser.fixtures';
import {
  CHOICE_1,
  CHOICE_2,
  CHOICE_3,
  errorResult,
  finalizeExamAnswersMock,
  getNextQuestionMock,
  getPracticeSessionSummaryMock,
  mockBookmarksAndReview,
  PracticeSessionPageControllerReviewProbe,
  saveExamDraftAnswerMock,
  setupPracticeSessionPageControllerBrowserSpec,
} from './use-practice-session-page-controller-test-helpers';

setupPracticeSessionPageControllerBrowserSpec();

function mockActiveTimedExam(deadlineAt: string) {
  getPracticeSessionSummaryMock.mockResolvedValue(
    errorResult('CONFLICT', 'Practice session has not ended'),
  );
  getNextQuestionMock.mockResolvedValue(
    ok(
      createQuestionResponse({
        questionId: 'question-1',
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

function mockFinalizeSummary() {
  finalizeExamAnswersMock.mockResolvedValue(
    ok({
      sessionId: 'session-1',
      endedAt: '2026-05-22T12:01:12.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: {
        answered: 0,
        correct: 0,
        accuracy: 0,
        durationSeconds: 72,
      },
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('usePracticeSessionPageController timer expiry', () => {
  it('finalizes once on timer expiry even when the final draft save is rejected', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:01.000Z');
    mockFinalizeSummary();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired'),
    );

    const screen = await render(<PracticeSessionPageControllerReviewProbe />);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('question');
    await screen.getByRole('button', { name: 'select-choice-1' }).click();

    await vi.advanceTimersByTimeAsync(1_000);

    await expect
      .element(screen.getByTestId('active-view'))
      .toHaveTextContent('summary');
    expect(saveExamDraftAnswerMock).toHaveBeenCalledTimes(1);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(finalizeExamAnswersMock).toHaveBeenCalledTimes(1);
  });

  it('manual Review & Submit after expiry proceeds to finalization after a rejected draft save', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockActiveTimedExam('2026-05-22T12:00:01.000Z');
    mockFinalizeSummary();
    saveExamDraftAnswerMock.mockResolvedValue(
      errorResult('CONFLICT', 'Exam time has expired'),
    );

    const screen = await render(<PracticeSessionPageControllerReviewProbe />);

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
});
