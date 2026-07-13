import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  RateQuestionOutput,
  SubmitQuestionReportOutput,
} from '@/src/adapters/controllers/question-feedback-controller';
import type { QuestionFeedbackRating } from '@/src/domain/value-objects';
import { ok } from '@/tests/test-helpers/ok';
import {
  rateQuestionForQuestion,
  submitReportForQuestion,
} from './question-feedback-actions';

const questionId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const practiceSessionId = '33333333-3333-4333-8333-333333333333';
const firstIdempotencyKey = '44444444-4444-4444-8444-444444444444';
const secondIdempotencyKey = '55555555-5555-4555-8555-555555555555';

describe('question-feedback-actions', () => {
  it('optimistically records a rating and rotates the idempotency key after success', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];
    const setRatingKey = vi.fn();
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValue(ok({ rating: 'helpful' }));

    await rateQuestionForQuestion({
      question: { questionId, attemptId, practiceSessionId },
      currentRating: null,
      nextRating: 'helpful',
      ratingIdempotencyKey: firstIdempotencyKey,
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingIdempotencyKey: setRatingKey,
      rateQuestionFn,
      setRating: (rating) => ratings.push(rating),
      setFeedbackStatus: (status) => statuses.push(status),
    });

    expect(rateQuestionFn).toHaveBeenCalledWith({
      questionId,
      attemptId,
      practiceSessionId,
      rating: 'helpful',
      idempotencyKey: firstIdempotencyKey,
    });
    expect(ratings).toEqual(['helpful', 'helpful']);
    expect(statuses).toEqual(['saving', 'saved']);
    expect(setRatingKey).toHaveBeenCalledWith(secondIdempotencyKey);
  });

  it('initializes a rating idempotency key before the first rating write', async () => {
    const setRatingKey = vi.fn();
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValue(ok({ rating: 'helpful' }));

    await rateQuestionForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      currentRating: null,
      nextRating: 'helpful',
      ratingIdempotencyKey: null,
      createIdempotencyKey: () => firstIdempotencyKey,
      setRatingIdempotencyKey: setRatingKey,
      rateQuestionFn,
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    expect(setRatingKey).toHaveBeenCalledWith(firstIdempotencyKey);
    expect(rateQuestionFn).toHaveBeenCalledWith({
      questionId,
      attemptId: null,
      practiceSessionId: null,
      rating: 'helpful',
      idempotencyKey: firstIdempotencyKey,
    });
  });

  it('rolls back the optimistic rating when the write fails', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];
    const logError = vi.fn();

    await rateQuestionForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      currentRating: 'not_helpful',
      nextRating: null,
      ratingIdempotencyKey: firstIdempotencyKey,
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingIdempotencyKey: vi.fn(),
      rateQuestionFn: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Nope' },
      }),
      setRating: (rating) => ratings.push(rating),
      setFeedbackStatus: (status) => statuses.push(status),
      logError,
    });

    expect(ratings).toEqual([null, 'not_helpful']);
    expect(statuses).toEqual(['saving', 'error']);
    expect(logError).toHaveBeenCalledWith('Failed to rate question', {
      code: 'INTERNAL_ERROR',
      message: 'Nope',
    });
  });

  it('rotates the rating key after a determinate cached failure', async () => {
    const setRatingKey = vi.fn();

    await rateQuestionForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      currentRating: null,
      nextRating: 'helpful',
      ratingIdempotencyKey: firstIdempotencyKey,
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingIdempotencyKey: setRatingKey,
      rateQuestionFn: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rating' },
      }),
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    expect(setRatingKey).toHaveBeenCalledWith(secondIdempotencyKey);
  });

  it('rolls back thrown rating errors even when the reporter fails', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];

    await rateQuestionForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      currentRating: 'not_helpful',
      nextRating: 'helpful',
      ratingIdempotencyKey: firstIdempotencyKey,
      rateQuestionFn: vi.fn().mockRejectedValue(new Error('Network down')),
      setRating: (rating) => ratings.push(rating),
      setFeedbackStatus: (status) => statuses.push(status),
      logError: () => {
        throw new Error('Reporter down');
      },
    });

    expect(ratings).toEqual(['helpful', 'not_helpful']);
    expect(statuses).toEqual(['saving', 'error']);
  });

  it('does not roll back a failed rating after unmount', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];

    await rateQuestionForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      currentRating: 'not_helpful',
      nextRating: null,
      ratingIdempotencyKey: firstIdempotencyKey,
      rateQuestionFn: vi.fn().mockRejectedValue(new Error('Network down')),
      setRating: (rating) => ratings.push(rating),
      setFeedbackStatus: (status) => statuses.push(status),
      isMounted: () => false,
    });

    expect(ratings).toEqual([null]);
    expect(statuses).toEqual(['saving']);
  });

  it('submits report context and rotates its idempotency key only after success', async () => {
    const setReportKey = vi.fn();
    const submitQuestionReportFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SubmitQuestionReportOutput>>
      >()
      .mockResolvedValue(ok({ feedbackId: crypto.randomUUID() }));

    const didSubmit = await submitReportForQuestion({
      question: { questionId, attemptId, practiceSessionId },
      category: 'ambiguous_wording',
      comment: 'Needs a clearer stem.',
      reportIdempotencyKey: firstIdempotencyKey,
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportIdempotencyKey: setReportKey,
      submitQuestionReportFn,
    });

    expect(didSubmit).toBe(true);
    expect(submitQuestionReportFn).toHaveBeenCalledWith({
      questionId,
      attemptId,
      practiceSessionId,
      category: 'ambiguous_wording',
      comment: 'Needs a clearer stem.',
      idempotencyKey: firstIdempotencyKey,
    });
    expect(setReportKey).toHaveBeenCalledWith(secondIdempotencyKey);
  });

  it('initializes a report idempotency key before the first submit', async () => {
    const setReportKey = vi.fn();
    const submitQuestionReportFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SubmitQuestionReportOutput>>
      >()
      .mockResolvedValue(ok({ feedbackId: crypto.randomUUID() }));

    const didSubmit = await submitReportForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      category: 'incorrect_answer',
      comment: null,
      reportIdempotencyKey: null,
      createIdempotencyKey: () => firstIdempotencyKey,
      setReportIdempotencyKey: setReportKey,
      submitQuestionReportFn,
    });

    expect(didSubmit).toBe(true);
    expect(setReportKey).toHaveBeenCalledWith(firstIdempotencyKey);
    expect(submitQuestionReportFn).toHaveBeenCalledWith({
      questionId,
      attemptId: null,
      practiceSessionId: null,
      category: 'incorrect_answer',
      comment: null,
      idempotencyKey: firstIdempotencyKey,
    });
  });

  it('does not include free-text report comments in error log context', async () => {
    const logError = vi.fn();

    const didSubmit = await submitReportForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      category: 'other',
      comment: 'Sensitive free text',
      reportIdempotencyKey: firstIdempotencyKey,
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportIdempotencyKey: vi.fn(),
      submitQuestionReportFn: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Nope' },
      }),
      logError,
    });

    expect(didSubmit).toBe(false);
    expect(logError).toHaveBeenCalledWith('Failed to submit question report', {
      code: 'INTERNAL_ERROR',
      message: 'Nope',
      questionId,
      category: 'other',
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain(
      'Sensitive free text',
    );
  });

  it('rotates the report key after a determinate cached failure', async () => {
    const setReportKey = vi.fn();

    await submitReportForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      category: 'other',
      comment: null,
      reportIdempotencyKey: firstIdempotencyKey,
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportIdempotencyKey: setReportKey,
      submitQuestionReportFn: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      }),
    });

    expect(setReportKey).toHaveBeenCalledWith(secondIdempotencyKey);
  });

  it('returns false for thrown report errors even when the reporter fails', async () => {
    const didSubmit = await submitReportForQuestion({
      question: { questionId, attemptId: null, practiceSessionId: null },
      category: 'other',
      comment: 'Sensitive free text',
      reportIdempotencyKey: firstIdempotencyKey,
      submitQuestionReportFn: vi
        .fn()
        .mockRejectedValue(new Error('Network down')),
      logError: () => {
        throw new Error('Reporter down');
      },
    });

    expect(didSubmit).toBe(false);
  });
});
