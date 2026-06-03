import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
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

const questionId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const practiceSessionId = '33333333-3333-4333-8333-333333333333';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Probe({ initialReviewMode = true }: { initialReviewMode?: boolean }) {
  const [isReviewMode, setIsReviewMode] = useState(initialReviewMode);
  const output = usePracticeQuestionFeedback({
    question: {
      questionId,
      attemptId,
      practiceSessionId,
    },
    isReviewMode,
    isMounted: () => true,
  });

  return (
    <>
      <div data-testid="feedback-status">{output.feedbackStatus}</div>
      <div data-testid="rating">{output.rating ?? 'none'}</div>
      <div data-testid="is-report-open">
        {output.isReportOpen ? 'true' : 'false'}
      </div>
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
            comment: 'Needs a clearer stem.',
          });
        }}
      >
        submit-report
      </button>
      <button type="button" onClick={() => setIsReviewMode(false)}>
        leave-review
      </button>
    </>
  );
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
      comment: 'Needs a clearer stem.',
      idempotencyKey: expect.any(String),
    });

    await screen.getByRole('button', { name: 'close-report' }).click();
    await expect
      .element(screen.getByTestId('is-report-open'))
      .toHaveTextContent('false');
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
});
