import { shouldReportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  RateQuestionOutput,
  SubmitQuestionReportOutput,
} from '@/src/adapters/controllers/question-feedback-controller';
import {
  IdempotentActionNames,
  rotateGeneratedIdempotencyKeyAfterDeterminateError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import { ApplicationConflictReasons } from '@/src/application/errors';
import type {
  QuestionFeedbackCategory,
  QuestionFeedbackRating,
} from '@/src/domain/value-objects';
import {
  createRequestFingerprint,
  type FingerprintBoundIdempotencyKey,
  mintRequestKey,
  resolveRequestKey,
} from './idempotency-request-key';
import { STANDARD_MUTATION_TIMEOUT_MS } from './timeout-tiers';

const QUESTION_FEEDBACK_MUTATION_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

/**
 * A stored idempotency key bound to the request identity it was minted for.
 * The wrapper replays a completed cached outcome for a reused key BEFORE
 * execute() runs, so a preserved key must never travel with a different
 * request than the one that minted it: reuse is only safe when the outgoing
 * request's fingerprint matches. The repository's typed reused-token conflict
 * remains as defense in depth for the fenced-claim arm.
 */
export type FeedbackRequestToken = FingerprintBoundIdempotencyKey;

export function ratingRequestFingerprint(input: {
  question: FeedbackQuestionContext;
  rating: QuestionFeedbackRating | null;
}): string {
  return createRequestFingerprint([
    input.question.questionId,
    input.question.attemptId ?? null,
    input.question.practiceSessionId ?? null,
    input.rating,
  ]);
}

export function reportRequestFingerprint(input: {
  question: FeedbackQuestionContext;
  category: QuestionFeedbackCategory;
  comment: string | null;
}): string {
  return createRequestFingerprint([
    input.question.questionId,
    input.question.attemptId ?? null,
    input.question.practiceSessionId ?? null,
    input.category,
    input.comment,
  ]);
}

// A preserved key can still collide server-side after a fenced claim (row
// committed, wrapper outcome missing). The server rejects that reuse with a
// typed conflict; the client mints a fresh key and retries once.
function isFeedbackRequestReusedConflict(error: {
  code: string;
  details?: { reason?: string } | undefined;
}): boolean {
  return (
    error.code === 'CONFLICT' &&
    error.details?.reason === ApplicationConflictReasons.FeedbackRequestReused
  );
}

export type FeedbackQuestionContext = {
  questionId: string;
  attemptId?: string | null;
  practiceSessionId?: string | null;
};

export async function rateQuestionForQuestion(input: {
  question: FeedbackQuestionContext | null;
  currentRating: QuestionFeedbackRating | null;
  nextRating: QuestionFeedbackRating | null;
  ratingRequestToken?: FeedbackRequestToken | null;
  createIdempotencyKey?: () => string;
  setRatingRequestToken?: (token: FeedbackRequestToken) => void;
  rateQuestionFn: (input: unknown) => Promise<ActionResult<RateQuestionOutput>>;
  setRating: (rating: QuestionFeedbackRating | null) => void;
  setFeedbackStatus: (
    status: 'idle' | 'loading' | 'saving' | 'saved' | 'error',
  ) => void;
  logError?: (message: string, context: unknown) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  if (!input.question) return;

  const isMounted = input.isMounted ?? (() => true);
  const setToken = input.setRatingRequestToken;
  const fingerprint = ratingRequestFingerprint({
    question: input.question,
    rating: input.nextRating,
  });
  let requestIdempotencyKey = resolveRequestKey(
    input.ratingRequestToken,
    fingerprint,
    input.createIdempotencyKey,
    setToken,
  );

  input.setFeedbackStatus('saving');
  input.setRating(input.nextRating);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result: ActionResult<RateQuestionOutput>;
    try {
      result = await withTimeout(
        input.rateQuestionFn({
          questionId: input.question.questionId,
          attemptId: input.question.attemptId ?? null,
          practiceSessionId: input.question.practiceSessionId ?? null,
          rating: input.nextRating,
          idempotencyKey: requestIdempotencyKey ?? undefined,
        }),
        QUESTION_FEEDBACK_MUTATION_TIMEOUT_MS,
      );
    } catch (error) {
      try {
        input.logError?.('Failed to rate question', error);
      } catch {
        // Reporter failures must not block the primary error path.
      }
      if (!isMounted()) return;
      input.setRating(input.currentRating);
      input.setFeedbackStatus('error');
      return;
    }

    if (!result.ok) {
      if (
        attempt === 0 &&
        isFeedbackRequestReusedConflict(result.error) &&
        input.createIdempotencyKey
      ) {
        requestIdempotencyKey = mintRequestKey(
          input.createIdempotencyKey,
          fingerprint,
          setToken,
        );
        continue;
      }
      if (shouldReportClientError(result.error)) {
        try {
          input.logError?.('Failed to rate question', result.error);
        } catch {
          // Reporter failures must not block the primary error path.
        }
      }
      if (!isMounted()) return;
      rotateGeneratedIdempotencyKeyAfterDeterminateError(
        IdempotentActionNames.QuestionRating,
        result.error,
        {
          createIdempotencyKey: input.createIdempotencyKey,
          setIdempotencyKey: setToken
            ? (key) => setToken({ key, fingerprint })
            : undefined,
        },
      );
      input.setRating(input.currentRating);
      input.setFeedbackStatus('error');
      return;
    }

    if (!isMounted()) return;

    input.setRating(result.data.rating);
    if (setToken && input.createIdempotencyKey) {
      mintRequestKey(input.createIdempotencyKey, fingerprint, setToken);
    }
    input.setFeedbackStatus('saved');
    return;
  }
}

export async function submitReportForQuestion(input: {
  question: FeedbackQuestionContext | null;
  category: QuestionFeedbackCategory;
  comment: string | null;
  reportRequestToken?: FeedbackRequestToken | null;
  createIdempotencyKey?: () => string;
  setReportRequestToken?: (token: FeedbackRequestToken) => void;
  submitQuestionReportFn: (
    input: unknown,
  ) => Promise<ActionResult<SubmitQuestionReportOutput>>;
  logError?: (message: string, context: unknown) => void;
  isMounted?: () => boolean;
}): Promise<boolean> {
  if (!input.question) return false;

  const isMounted = input.isMounted ?? (() => true);
  const setToken = input.setReportRequestToken;
  const fingerprint = reportRequestFingerprint({
    question: input.question,
    category: input.category,
    comment: input.comment,
  });
  let requestIdempotencyKey = resolveRequestKey(
    input.reportRequestToken,
    fingerprint,
    input.createIdempotencyKey,
    setToken,
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result: ActionResult<SubmitQuestionReportOutput>;
    try {
      result = await withTimeout(
        input.submitQuestionReportFn({
          questionId: input.question.questionId,
          attemptId: input.question.attemptId ?? null,
          practiceSessionId: input.question.practiceSessionId ?? null,
          category: input.category,
          comment: input.comment,
          idempotencyKey: requestIdempotencyKey ?? undefined,
        }),
        QUESTION_FEEDBACK_MUTATION_TIMEOUT_MS,
      );
    } catch (error) {
      try {
        input.logError?.('Failed to submit question report', {
          error,
          questionId: input.question.questionId,
          category: input.category,
        });
      } catch {
        // Reporter failures must not block the primary error path.
      }
      return false;
    }

    if (!result.ok) {
      if (
        attempt === 0 &&
        isFeedbackRequestReusedConflict(result.error) &&
        input.createIdempotencyKey
      ) {
        requestIdempotencyKey = mintRequestKey(
          input.createIdempotencyKey,
          fingerprint,
          setToken,
        );
        continue;
      }
      if (shouldReportClientError(result.error)) {
        try {
          input.logError?.('Failed to submit question report', {
            ...result.error,
            questionId: input.question.questionId,
            category: input.category,
          });
        } catch {
          // Reporter failures must not block the primary error path.
        }
      }
      if (isMounted()) {
        rotateGeneratedIdempotencyKeyAfterDeterminateError(
          IdempotentActionNames.QuestionReport,
          result.error,
          {
            createIdempotencyKey: input.createIdempotencyKey,
            setIdempotencyKey: setToken
              ? (key) => setToken({ key, fingerprint })
              : undefined,
          },
        );
      }
      return false;
    }

    if (!isMounted()) return false;

    if (setToken && input.createIdempotencyKey) {
      mintRequestKey(input.createIdempotencyKey, fingerprint, setToken);
    }
    return true;
  }

  return false;
}
