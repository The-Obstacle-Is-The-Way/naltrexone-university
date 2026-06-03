import { shouldReportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  RateQuestionOutput,
  SubmitQuestionReportOutput,
} from '@/src/adapters/controllers/question-feedback-controller';
import type {
  QuestionFeedbackCategory,
  QuestionFeedbackRating,
} from '@/src/domain/value-objects';
import { STANDARD_MUTATION_TIMEOUT_MS } from './timeout-tiers';

const QUESTION_FEEDBACK_MUTATION_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export type FeedbackQuestionContext = {
  questionId: string;
  attemptId?: string | null;
  practiceSessionId?: string | null;
};

export async function rateQuestionForQuestion(input: {
  question: FeedbackQuestionContext | null;
  currentRating: QuestionFeedbackRating | null;
  nextRating: QuestionFeedbackRating | null;
  ratingIdempotencyKey?: string | null;
  createIdempotencyKey?: () => string;
  setRatingIdempotencyKey?: (key: string) => void;
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
  const requestIdempotencyKey =
    input.ratingIdempotencyKey ?? input.createIdempotencyKey?.();

  if (!input.ratingIdempotencyKey && requestIdempotencyKey) {
    input.setRatingIdempotencyKey?.(requestIdempotencyKey);
  }

  input.setFeedbackStatus('saving');
  input.setRating(input.nextRating);

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
    if (shouldReportClientError(result.error)) {
      try {
        input.logError?.('Failed to rate question', result.error);
      } catch {
        // Reporter failures must not block the primary error path.
      }
    }
    if (!isMounted()) return;
    input.setRating(input.currentRating);
    input.setFeedbackStatus('error');
    return;
  }

  if (!isMounted()) return;

  input.setRating(result.data.rating);
  if (input.setRatingIdempotencyKey && input.createIdempotencyKey) {
    input.setRatingIdempotencyKey(input.createIdempotencyKey());
  }
  input.setFeedbackStatus('saved');
}

export async function submitReportForQuestion(input: {
  question: FeedbackQuestionContext | null;
  category: QuestionFeedbackCategory;
  comment: string | null;
  reportIdempotencyKey?: string | null;
  createIdempotencyKey?: () => string;
  setReportIdempotencyKey?: (key: string) => void;
  submitQuestionReportFn: (
    input: unknown,
  ) => Promise<ActionResult<SubmitQuestionReportOutput>>;
  logError?: (message: string, context: unknown) => void;
  isMounted?: () => boolean;
}): Promise<boolean> {
  if (!input.question) return false;

  const isMounted = input.isMounted ?? (() => true);
  const requestIdempotencyKey =
    input.reportIdempotencyKey ?? input.createIdempotencyKey?.();

  if (!input.reportIdempotencyKey && requestIdempotencyKey) {
    input.setReportIdempotencyKey?.(requestIdempotencyKey);
  }

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
    return false;
  }

  if (!isMounted()) return false;

  if (input.setReportIdempotencyKey && input.createIdempotencyKey) {
    input.setReportIdempotencyKey(input.createIdempotencyKey());
  }
  return true;
}
