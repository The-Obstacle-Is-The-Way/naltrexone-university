import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as clientError from '@/lib/report-client-error';
import * as questionFeedbackController from '@/src/adapters/controllers/question-feedback-controller';
import { ok } from '@/tests/test-helpers/ok';
import { usePracticeQuestionFeedback } from './use-practice-question-feedback';

vi.mock('@/src/adapters/controllers/question-feedback-controller', {
  spy: true,
});
vi.mock('@/lib/report-client-error', { spy: true });

const getQuestionRating = vi.mocked(
  questionFeedbackController.getQuestionRating,
);
const rateQuestion = vi.mocked(questionFeedbackController.rateQuestion);
const submitQuestionReport = vi.mocked(
  questionFeedbackController.submitQuestionReport,
);
const reportClientError = vi.mocked(clientError.reportClientError);

const questionId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const reattemptId = '44444444-4444-4444-8444-444444444444';
const practiceSessionId = '33333333-3333-4333-8333-333333333333';
const initialReportComment = 'Needs a clearer stem.';
const editedReportComment = 'The revised stem is still ambiguous.';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Probe({
  initialReviewMode = true,
  isMounted = () => true,
}: {
  initialReviewMode?: boolean;
  isMounted?: () => boolean;
}) {
  const [isReviewMode, setIsReviewMode] = useState(initialReviewMode);
  const [currentAttemptId, setCurrentAttemptId] = useState(attemptId);
  const [reportComment, setReportComment] = useState(initialReportComment);
  const output = usePracticeQuestionFeedback({
    question: {
      questionId,
      attemptId: currentAttemptId,
      practiceSessionId,
    },
    isReviewMode,
    isMounted,
  });

  return (
    <>
      <div data-testid="feedback-status">{output.feedbackStatus}</div>
      <div data-testid="rating">{output.rating ?? 'none'}</div>
      <div data-testid="is-report-open">
        {output.isReportOpen ? 'true' : 'false'}
      </div>
      <div data-testid="attempt-id">{currentAttemptId}</div>
      <div data-testid="report-comment">{reportComment}</div>
      <button type="button" onClick={() => output.onRate('helpful')}>
        rate-helpful
      </button>
      <button type="button" onClick={() => output.onRate(null)}>
        retract
      </button>
      <button type="button" onClick={() => output.openReport()}>
        open-report
      </button>
      <button type="button" onClick={() => output.openReport(false)}>
        close-report
      </button>
      <button
        type="button"
        onClick={() => {
          void output.submitReport({
            category: 'ambiguous_wording',
            comment: reportComment,
          });
        }}
      >
        submit-report
      </button>
      <button type="button" onClick={() => setIsReviewMode(false)}>
        leave-review
      </button>
      <button type="button" onClick={() => setCurrentAttemptId(reattemptId)}>
        reattempt
      </button>
      <button
        type="button"
        onClick={() => setReportComment(editedReportComment)}
      >
        edit-report
      </button>
    </>
  );
}

function requestKeyAt(
  calls: readonly (readonly unknown[])[],
  index: number,
): string | undefined {
  const request = calls[index]?.[0];
  if (!request || typeof request !== 'object') return undefined;
  if (!('idempotencyKey' in request)) return undefined;
  return typeof request.idempotencyKey === 'string'
    ? request.idempotencyKey
    : undefined;
}

async function waitForAsyncContinuation(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('usePracticeQuestionFeedback (browser)', () => {
  beforeEach(() => {
    getQuestionRating.mockResolvedValue(ok({ rating: null }));
    rateQuestion.mockResolvedValue(ok({ rating: null }));
    submitQuestionReport.mockResolvedValue(
      ok({ feedbackId: crypto.randomUUID() }),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates the current rating when review feedback is visible', async () => {
    getQuestionRating.mockResolvedValue(ok({ rating: 'helpful' }));

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('helpful');
    expect(getQuestionRating).toHaveBeenCalledWith({ questionId });
  });

  it('reports hydration action errors and enters an error state', async () => {
    getQuestionRating.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Nope' },
    });

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('error');
    expect(reportClientError).toHaveBeenCalledWith(
      { code: 'INTERNAL_ERROR', message: 'Nope' },
      {
        component: 'UsePracticeQuestionFeedback',
        action: 'loadQuestionRating',
      },
    );
  });

  it('reports thrown hydration errors and enters an error state', async () => {
    const error = new Error('Network down');
    getQuestionRating.mockRejectedValue(error);

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('error');
    expect(reportClientError).toHaveBeenCalledWith(error, {
      component: 'UsePracticeQuestionFeedback',
      action: 'loadQuestionRating',
    });
  });

  it('ignores hydration results after unmount', async () => {
    getQuestionRating.mockResolvedValue(ok({ rating: 'helpful' }));

    const screen = await render(<Probe isMounted={() => false} />);

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('loading');
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('none');
  });

  it('optimistically applies a rating before the write resolves', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof rateQuestion>>>();
    rateQuestion.mockReturnValue(deferred.promise);

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'rate-helpful' }).click();

    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('helpful');
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('saving');

    deferred.resolve(ok({ rating: 'helpful' }));
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('saved');
    expect(rateQuestion).toHaveBeenCalledWith({
      questionId,
      attemptId,
      practiceSessionId,
      rating: 'helpful',
      idempotencyKey: expect.any(String),
    });
  });

  it('preserves a newer reattempt rating key after the stale request completes', async () => {
    const staleResponse =
      createDeferred<Awaited<ReturnType<typeof rateQuestion>>>();
    rateQuestion
      .mockReturnValueOnce(staleResponse.promise)
      .mockRejectedValueOnce(new Error('newer response lost after commit'))
      .mockResolvedValueOnce(ok({ rating: 'helpful' }));

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'rate-helpful' }).click();
    await expect.poll(() => rateQuestion.mock.calls.length).toBe(1);
    const firstKey = requestKeyAt(rateQuestion.mock.calls, 0);

    await screen.getByRole('button', { name: 'reattempt' }).click();
    await expect
      .element(screen.getByTestId('attempt-id'))
      .toHaveTextContent(reattemptId);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'rate-helpful' }).click();
    await expect.poll(() => rateQuestion.mock.calls.length).toBe(2);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('error');
    const newerKey = requestKeyAt(rateQuestion.mock.calls, 1);
    expect(newerKey).toEqual(expect.any(String));
    expect(newerKey).not.toBe(firstKey);

    staleResponse.resolve(ok({ rating: 'helpful' }));
    await waitForAsyncContinuation();

    await screen.getByRole('button', { name: 'rate-helpful' }).click();
    await expect.poll(() => rateQuestion.mock.calls.length).toBe(3);

    expect(requestKeyAt(rateQuestion.mock.calls, 2)).toBe(newerKey);
  });

  it('rolls back a retraction when the write fails', async () => {
    getQuestionRating.mockResolvedValue(ok({ rating: 'not_helpful' }));
    rateQuestion.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Nope' },
    });

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('not_helpful');

    await screen.getByRole('button', { name: 'retract' }).click();

    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('not_helpful');
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('error');
    expect(rateQuestion).toHaveBeenCalledWith({
      questionId,
      attemptId,
      practiceSessionId,
      rating: null,
      idempotencyKey: expect.any(String),
    });
  });

  it('opens and closes the report dialog state and submits report context', async () => {
    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('is-report-open'))
      .toHaveTextContent('false');

    await screen.getByRole('button', { name: 'open-report' }).click();
    await expect
      .element(screen.getByTestId('is-report-open'))
      .toHaveTextContent('true');

    await screen.getByRole('button', { name: 'submit-report' }).click();
    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(1);
    expect(submitQuestionReport).toHaveBeenCalledWith({
      questionId,
      attemptId,
      practiceSessionId,
      category: 'ambiguous_wording',
      comment: initialReportComment,
      idempotencyKey: expect.any(String),
    });

    await screen.getByRole('button', { name: 'close-report' }).click();
    await expect
      .element(screen.getByTestId('is-report-open'))
      .toHaveTextContent('false');
  });

  it('preserves a newer edited-report key after the stale dialog request completes', async () => {
    const staleResponse =
      createDeferred<Awaited<ReturnType<typeof submitQuestionReport>>>();
    submitQuestionReport
      .mockReturnValueOnce(staleResponse.promise)
      .mockRejectedValueOnce(new Error('newer response lost after commit'))
      .mockResolvedValueOnce(ok({ feedbackId: crypto.randomUUID() }));

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'open-report' }).click();
    await screen.getByRole('button', { name: 'submit-report' }).click();
    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(1);
    const firstKey = requestKeyAt(submitQuestionReport.mock.calls, 0);

    await screen.getByRole('button', { name: 'close-report' }).click();
    await screen.getByRole('button', { name: 'edit-report' }).click();
    await expect
      .element(screen.getByTestId('report-comment'))
      .toHaveTextContent(editedReportComment);
    await screen.getByRole('button', { name: 'open-report' }).click();
    await screen.getByRole('button', { name: 'submit-report' }).click();
    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(2);
    await expect.poll(() => reportClientError.mock.calls.length).toBe(1);
    const newerKey = requestKeyAt(submitQuestionReport.mock.calls, 1);
    expect(newerKey).toEqual(expect.any(String));
    expect(newerKey).not.toBe(firstKey);

    staleResponse.resolve(ok({ feedbackId: crypto.randomUUID() }));
    await waitForAsyncContinuation();

    await screen.getByRole('button', { name: 'submit-report' }).click();
    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(3);

    expect(requestKeyAt(submitQuestionReport.mock.calls, 2)).toBe(newerKey);
  });

  it('commits reused-token retry and success rotations for one owner generation', async () => {
    rateQuestion
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Feedback request token was reused with a different request',
          details: { reason: 'feedback_request_token_reused' },
        },
      })
      .mockResolvedValueOnce(ok({ rating: 'helpful' }))
      .mockResolvedValueOnce(ok({ rating: 'helpful' }));

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'rate-helpful' }).click();
    await expect.poll(() => rateQuestion.mock.calls.length).toBe(2);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('saved');

    const initialKey = requestKeyAt(rateQuestion.mock.calls, 0);
    const retryKey = requestKeyAt(rateQuestion.mock.calls, 1);
    expect(retryKey).toEqual(expect.any(String));
    expect(retryKey).not.toBe(initialKey);

    await screen.getByRole('button', { name: 'rate-helpful' }).click();
    await expect.poll(() => rateQuestion.mock.calls.length).toBe(3);

    const retiredKey = requestKeyAt(rateQuestion.mock.calls, 2);
    expect(retiredKey).toEqual(expect.any(String));
    expect(retiredKey).not.toBe(retryKey);
  });

  it('reports submit-report failures through the client error reporter', async () => {
    submitQuestionReport.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Nope' },
    });

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'submit-report' }).click();

    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(1);
    expect(reportClientError).toHaveBeenCalledWith(
      {
        code: 'INTERNAL_ERROR',
        message: 'Nope',
        questionId,
        category: 'ambiguous_wording',
      },
      {
        component: 'UsePracticeQuestionFeedback',
        action: 'submitQuestionReport',
      },
    );
  });

  it('ignores rating state updates after unmount', async () => {
    rateQuestion.mockResolvedValue(ok({ rating: 'helpful' }));

    const screen = await render(<Probe isMounted={() => false} />);

    await screen.getByRole('button', { name: 'rate-helpful' }).click();

    await expect.poll(() => rateQuestion.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('none');
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('loading');
  });

  it('resets rating state when leaving review mode', async () => {
    getQuestionRating.mockResolvedValue(ok({ rating: 'helpful' }));

    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('helpful');

    await screen.getByRole('button', { name: 'leave-review' }).click();

    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('none');
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');
  });

  it('ignores rate and report commands after leaving review mode', async () => {
    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'leave-review' }).click();
    await screen.getByRole('button', { name: 'rate-helpful' }).click();
    await screen.getByRole('button', { name: 'submit-report' }).click();

    expect(rateQuestion).not.toHaveBeenCalled();
    expect(submitQuestionReport).not.toHaveBeenCalled();
  });
});
