import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as questionFeedbackController from '@/src/adapters/controllers/question-feedback-controller';
import type { GetQuestionBySlugOutput } from '@/src/adapters/controllers/question-view-controller';
import { ok } from '@/tests/test-helpers/ok';
import { useQuestionPageFeedback } from './use-question-page-feedback';

vi.mock('@/src/adapters/controllers/question-feedback-controller', {
  spy: true,
});
vi.mock('@/lib/report-client-error', { spy: true });

const getQuestionRating = vi.mocked(
  questionFeedbackController.getQuestionRating,
);
const submitQuestionReport = vi.mocked(
  questionFeedbackController.submitQuestionReport,
);

const questionId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const practiceSessionId = '33333333-3333-4333-8333-333333333333';

function createQuestion(): GetQuestionBySlugOutput {
  return {
    questionId,
    slug: 'question-1',
    stemMd: 'Stem',
    difficulty: 'easy',
    choices: [],
  };
}

function Probe({ mode = 'review' }: { mode?: 'review' | null }) {
  const output = useQuestionPageFeedback({
    mode,
    question: createQuestion(),
    attemptId,
    practiceSessionId,
    isMounted: () => true,
  });

  return (
    <>
      <div data-testid="feedback-status">{output.feedbackStatus}</div>
      <div data-testid="rating">{output.rating ?? 'none'}</div>
      <button
        type="button"
        onClick={() => {
          void output.submitReport({
            category: 'outdated_reference',
            comment: null,
          });
        }}
      >
        submit-report
      </button>
    </>
  );
}

describe('useQuestionPageFeedback (browser)', () => {
  beforeEach(() => {
    getQuestionRating.mockResolvedValue(ok({ rating: null }));
    submitQuestionReport.mockResolvedValue(
      ok({ feedbackId: crypto.randomUUID() }),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates rating state in standalone review mode', async () => {
    getQuestionRating.mockResolvedValue(ok({ rating: 'not_helpful' }));

    const screen = await render(<Probe />);

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('not_helpful');
    expect(getQuestionRating).toHaveBeenCalledWith({ questionId });
  });

  it('does not hydrate outside review mode', async () => {
    const screen = await render(<Probe mode={null} />);

    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');
    await expect
      .element(screen.getByTestId('rating'))
      .toHaveTextContent('none');
    expect(getQuestionRating).not.toHaveBeenCalled();
  });

  it('submits report context from the review route', async () => {
    const screen = await render(<Probe />);
    await expect
      .element(screen.getByTestId('feedback-status'))
      .toHaveTextContent('idle');

    await screen.getByRole('button', { name: 'submit-report' }).click();

    await expect.poll(() => submitQuestionReport.mock.calls.length).toBe(1);
    expect(submitQuestionReport).toHaveBeenCalledWith({
      questionId,
      attemptId,
      practiceSessionId,
      category: 'outdated_reference',
      comment: null,
      idempotencyKey: expect.any(String),
    });
  });
});
