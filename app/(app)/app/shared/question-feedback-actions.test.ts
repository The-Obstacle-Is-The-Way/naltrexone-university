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
  ratingRequestFingerprint,
  reportRequestFingerprint,
  submitReportForQuestion,
} from './question-feedback-actions';

const questionId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const practiceSessionId = '33333333-3333-4333-8333-333333333333';
const firstIdempotencyKey = '44444444-4444-4444-8444-444444444444';
const secondIdempotencyKey = '55555555-5555-4555-8555-555555555555';

describe('question-feedback-actions', () => {
  it('optimistically records a rating and rotates the request token after success', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];
    const setRatingToken = vi.fn();
    const question = { questionId, attemptId, practiceSessionId };
    const fingerprint = ratingRequestFingerprint({
      question,
      rating: 'helpful',
    });
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValue(ok({ rating: 'helpful' }));

    await rateQuestionForQuestion({
      question,
      currentRating: null,
      nextRating: 'helpful',
      ratingRequestToken: { key: firstIdempotencyKey, fingerprint },
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingRequestToken: setRatingToken,
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
    expect(setRatingToken).toHaveBeenCalledWith({
      key: secondIdempotencyKey,
      fingerprint,
    });
  });

  it('initializes a rating request token before the first rating write', async () => {
    const setRatingToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const fingerprint = ratingRequestFingerprint({
      question,
      rating: 'helpful',
    });
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValue(ok({ rating: 'helpful' }));

    await rateQuestionForQuestion({
      question,
      currentRating: null,
      nextRating: 'helpful',
      ratingRequestToken: null,
      createIdempotencyKey: () => firstIdempotencyKey,
      setRatingRequestToken: setRatingToken,
      rateQuestionFn,
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    expect(setRatingToken).toHaveBeenNthCalledWith(1, {
      key: firstIdempotencyKey,
      fingerprint,
    });
    expect(rateQuestionFn).toHaveBeenCalledWith({
      questionId,
      attemptId: null,
      practiceSessionId: null,
      rating: 'helpful',
      idempotencyKey: firstIdempotencyKey,
    });
  });

  it('mints a fresh key when the preserved rating token was minted for a different intent', async () => {
    const setRatingToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValue(ok({ rating: 'not_helpful' }));

    await rateQuestionForQuestion({
      question,
      currentRating: 'helpful',
      nextRating: 'not_helpful',
      // The stored token was minted for the 'helpful' vote: reusing its key
      // for the changed vote would replay the committed 'helpful' outcome.
      ratingRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: ratingRequestFingerprint({ question, rating: 'helpful' }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingRequestToken: setRatingToken,
      rateQuestionFn,
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    expect(rateQuestionFn).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: secondIdempotencyKey }),
    );
    expect(setRatingToken).toHaveBeenNthCalledWith(1, {
      key: secondIdempotencyKey,
      fingerprint: ratingRequestFingerprint({
        question,
        rating: 'not_helpful',
      }),
    });
  });

  it('rolls back the optimistic rating when the write fails', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];
    const logError = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };

    await rateQuestionForQuestion({
      question,
      currentRating: 'not_helpful',
      nextRating: null,
      ratingRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: ratingRequestFingerprint({ question, rating: null }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingRequestToken: vi.fn(),
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

  it('rotates the rating token after a determinate cached failure', async () => {
    const setRatingToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const fingerprint = ratingRequestFingerprint({
      question,
      rating: 'helpful',
    });

    await rateQuestionForQuestion({
      question,
      currentRating: null,
      nextRating: 'helpful',
      ratingRequestToken: { key: firstIdempotencyKey, fingerprint },
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingRequestToken: setRatingToken,
      rateQuestionFn: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rating' },
      }),
      setRating: vi.fn(),
      setFeedbackStatus: vi.fn(),
    });

    expect(setRatingToken).toHaveBeenCalledWith({
      key: secondIdempotencyKey,
      fingerprint,
    });
  });

  it('rolls back thrown rating errors even when the reporter fails', async () => {
    const statuses: string[] = [];
    const ratings: Array<QuestionFeedbackRating | null> = [];
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };

    await rateQuestionForQuestion({
      question,
      currentRating: 'not_helpful',
      nextRating: 'helpful',
      ratingRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: ratingRequestFingerprint({ question, rating: 'helpful' }),
      },
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
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };

    await rateQuestionForQuestion({
      question,
      currentRating: 'not_helpful',
      nextRating: null,
      ratingRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: ratingRequestFingerprint({ question, rating: null }),
      },
      rateQuestionFn: vi.fn().mockRejectedValue(new Error('Network down')),
      setRating: (rating) => ratings.push(rating),
      setFeedbackStatus: (status) => statuses.push(status),
      isMounted: () => false,
    });

    expect(ratings).toEqual([null]);
    expect(statuses).toEqual(['saving']);
  });

  it('submits report context and rotates its request token only after success', async () => {
    const setReportToken = vi.fn();
    const question = { questionId, attemptId, practiceSessionId };
    const fingerprint = reportRequestFingerprint({
      question,
      category: 'ambiguous_wording',
      comment: 'Needs a clearer stem.',
    });
    const submitQuestionReportFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SubmitQuestionReportOutput>>
      >()
      .mockResolvedValue(ok({ feedbackId: crypto.randomUUID() }));

    const didSubmit = await submitReportForQuestion({
      question,
      category: 'ambiguous_wording',
      comment: 'Needs a clearer stem.',
      reportRequestToken: { key: firstIdempotencyKey, fingerprint },
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportRequestToken: setReportToken,
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
    expect(setReportToken).toHaveBeenCalledWith({
      key: secondIdempotencyKey,
      fingerprint,
    });
  });

  it('initializes a report request token before the first submit', async () => {
    const setReportToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const fingerprint = reportRequestFingerprint({
      question,
      category: 'incorrect_answer',
      comment: null,
    });
    const submitQuestionReportFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SubmitQuestionReportOutput>>
      >()
      .mockResolvedValue(ok({ feedbackId: crypto.randomUUID() }));

    const didSubmit = await submitReportForQuestion({
      question,
      category: 'incorrect_answer',
      comment: null,
      reportRequestToken: null,
      createIdempotencyKey: () => firstIdempotencyKey,
      setReportRequestToken: setReportToken,
      submitQuestionReportFn,
    });

    expect(didSubmit).toBe(true);
    expect(setReportToken).toHaveBeenNthCalledWith(1, {
      key: firstIdempotencyKey,
      fingerprint,
    });
    expect(submitQuestionReportFn).toHaveBeenCalledWith({
      questionId,
      attemptId: null,
      practiceSessionId: null,
      category: 'incorrect_answer',
      comment: null,
      idempotencyKey: firstIdempotencyKey,
    });
  });

  it('mints a fresh key when the preserved report token was minted for a different intent', async () => {
    const setReportToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const submitQuestionReportFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SubmitQuestionReportOutput>>
      >()
      .mockResolvedValue(ok({ feedbackId: crypto.randomUUID() }));

    const didSubmit = await submitReportForQuestion({
      question,
      category: 'other',
      comment: 'Edited comment',
      // The stored token belongs to the original submission: reusing its key
      // for the edited report would replay the original as a success.
      reportRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: reportRequestFingerprint({
          question,
          category: 'other',
          comment: 'Original comment',
        }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportRequestToken: setReportToken,
      submitQuestionReportFn,
    });

    expect(didSubmit).toBe(true);
    expect(submitQuestionReportFn).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: secondIdempotencyKey }),
    );
    expect(setReportToken).toHaveBeenNthCalledWith(1, {
      key: secondIdempotencyKey,
      fingerprint: reportRequestFingerprint({
        question,
        category: 'other',
        comment: 'Edited comment',
      }),
    });
  });

  it('does not include free-text report comments in error log context', async () => {
    const logError = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };

    const didSubmit = await submitReportForQuestion({
      question,
      category: 'other',
      comment: 'Sensitive free text',
      reportRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: reportRequestFingerprint({
          question,
          category: 'other',
          comment: 'Sensitive free text',
        }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportRequestToken: vi.fn(),
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

  it('rotates the report token after a determinate cached failure', async () => {
    const setReportToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const fingerprint = reportRequestFingerprint({
      question,
      category: 'other',
      comment: null,
    });

    await submitReportForQuestion({
      question,
      category: 'other',
      comment: null,
      reportRequestToken: { key: firstIdempotencyKey, fingerprint },
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportRequestToken: setReportToken,
      submitQuestionReportFn: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      }),
    });

    expect(setReportToken).toHaveBeenCalledWith({
      key: secondIdempotencyKey,
      fingerprint,
    });
  });

  it('returns false for thrown report errors even when the reporter fails', async () => {
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };

    const didSubmit = await submitReportForQuestion({
      question,
      category: 'other',
      comment: 'Sensitive free text',
      reportRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: reportRequestFingerprint({
          question,
          category: 'other',
          comment: 'Sensitive free text',
        }),
      },
      submitQuestionReportFn: vi
        .fn()
        .mockRejectedValue(new Error('Network down')),
      logError: () => {
        throw new Error('Reporter down');
      },
    });

    expect(didSubmit).toBe(false);
  });

  it('mints a fresh key and retries once when a changed rating hits a reused token', async () => {
    const setRatingToken = vi.fn();
    const ratings: Array<QuestionFeedbackRating | null> = [];
    const statuses: string[] = [];
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Feedback request token was reused with a different request',
          details: { reason: 'feedback_request_token_reused' },
        },
      })
      .mockResolvedValueOnce(ok({ rating: 'not_helpful' }));

    await rateQuestionForQuestion({
      question,
      currentRating: 'helpful',
      nextRating: 'not_helpful',
      ratingRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: ratingRequestFingerprint({
          question,
          rating: 'not_helpful',
        }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingRequestToken: setRatingToken,
      rateQuestionFn,
      setRating: (rating) => ratings.push(rating),
      setFeedbackStatus: (status) => statuses.push(status),
    });

    expect(rateQuestionFn).toHaveBeenCalledTimes(2);
    expect(rateQuestionFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: secondIdempotencyKey }),
    );
    // The changed vote lands instead of being silently replaced by the
    // original committed rating.
    expect(ratings.at(-1)).toBe('not_helpful');
    expect(statuses.at(-1)).toBe('saved');
  });

  it('mints a fresh key and retries once when an edited report hits a reused token', async () => {
    const setReportToken = vi.fn();
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const submitQuestionReportFn = vi
      .fn<
        (input: unknown) => Promise<ActionResult<SubmitQuestionReportOutput>>
      >()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Feedback request token was reused with a different request',
          details: { reason: 'feedback_request_token_reused' },
        },
      })
      .mockResolvedValueOnce(ok({ feedbackId: questionId }));

    const didSubmit = await submitReportForQuestion({
      question,
      category: 'other',
      comment: 'Edited comment',
      reportRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: reportRequestFingerprint({
          question,
          category: 'other',
          comment: 'Edited comment',
        }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setReportRequestToken: setReportToken,
      submitQuestionReportFn,
    });

    expect(didSubmit).toBe(true);
    expect(submitQuestionReportFn).toHaveBeenCalledTimes(2);
    expect(submitQuestionReportFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: secondIdempotencyKey }),
    );
  });

  it('does not retry a reused-token conflict more than once', async () => {
    const question = {
      questionId,
      attemptId: null,
      practiceSessionId: null,
    };
    const rateQuestionFn = vi
      .fn<(input: unknown) => Promise<ActionResult<RateQuestionOutput>>>()
      .mockResolvedValue({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Feedback request token was reused with a different request',
          details: { reason: 'feedback_request_token_reused' },
        },
      });
    const statuses: string[] = [];

    await rateQuestionForQuestion({
      question,
      currentRating: 'helpful',
      nextRating: 'not_helpful',
      ratingRequestToken: {
        key: firstIdempotencyKey,
        fingerprint: ratingRequestFingerprint({
          question,
          rating: 'not_helpful',
        }),
      },
      createIdempotencyKey: () => secondIdempotencyKey,
      setRatingRequestToken: vi.fn(),
      rateQuestionFn,
      setRating: vi.fn(),
      setFeedbackStatus: (status) => statuses.push(status),
    });

    expect(rateQuestionFn).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('error');
  });
});
