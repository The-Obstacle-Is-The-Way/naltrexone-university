import { ApplicationError } from '@/src/application/errors';
import type {
  AttemptRepository,
  PracticeSessionRepository,
} from '@/src/application/ports/repositories';
import type { AttemptRetryOrigin } from '@/src/domain/entities';

/**
 * Client-supplied feedback context attached to a rating/report.
 *
 * Both IDs are optional (`null` = standalone / best-effort feedback). When
 * present they arrive only UUID-shape-validated from the controller boundary,
 * so the application layer must prove they belong to the caller and match the
 * feedback question before persisting them (BUG-260).
 */
export type FeedbackContextInput = {
  userId: string;
  questionId: string;
  attemptId: string | null;
  practiceSessionId: string | null;
};

export type ValidatedFeedbackContext = {
  attemptId: string | null;
  practiceSessionId: string | null;
};

/**
 * Validates optional feedback context against the caller's own data.
 *
 * Rules (decided in docs/bugs/bug-260-...):
 * - `attemptId` present -> must be owned by `userId` and its `questionId` must
 *   equal the feedback `questionId`.
 * - `practiceSessionId` present -> must be owned by `userId` and its
 *   `questionIds` must include the feedback `questionId`.
 * - both present -> the attempt must belong to the supplied session either
 *   directly (`practiceSessionId`) or as a session-review retry
 *   (`retryOrigin=session_review` + `retrySessionId`).
 *
 * Error mapping: not-found/not-owned -> `NOT_FOUND`; found-but-mismatched ->
 * `VALIDATION_ERROR`. Null context is always allowed and passes through
 * unchanged. Returns only the validated IDs so callers persist nothing else.
 */
export async function validateFeedbackContext(
  input: FeedbackContextInput,
  deps: {
    attempts: AttemptRepository;
    sessions: PracticeSessionRepository;
  },
): Promise<ValidatedFeedbackContext> {
  let attemptSessionId: string | null = null;
  let attemptRetryOrigin: AttemptRetryOrigin | null = null;
  let attemptRetrySessionId: string | null = null;

  if (input.attemptId !== null) {
    const attempt = await deps.attempts.findByIdAndUserId(
      input.attemptId,
      input.userId,
    );
    if (!attempt) {
      throw new ApplicationError('NOT_FOUND', 'Feedback attempt not found');
    }
    if (attempt.questionId !== input.questionId) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt does not match the question',
      );
    }
    attemptSessionId = attempt.practiceSessionId;
    attemptRetryOrigin = attempt.retryOrigin;
    attemptRetrySessionId = attempt.retrySessionId;
  }

  if (input.practiceSessionId !== null) {
    const session = await deps.sessions.findByIdAndUserId(
      input.practiceSessionId,
      input.userId,
    );
    if (!session) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Feedback practice session not found',
      );
    }
    if (!session.questionIds.includes(input.questionId)) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback practice session does not contain the question',
      );
    }
  }

  // When both are supplied, the attempt must have a real relationship to the
  // supplied session. Session-review retries are standalone attempts that point
  // back to the reviewed session through retry provenance.
  if (
    input.attemptId !== null &&
    input.practiceSessionId !== null &&
    attemptSessionId !== input.practiceSessionId &&
    !(
      attemptRetryOrigin === 'session_review' &&
      attemptRetrySessionId === input.practiceSessionId
    )
  ) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Feedback attempt is not part of the supplied session',
    );
  }

  return {
    attemptId: input.attemptId,
    practiceSessionId: input.practiceSessionId,
  };
}
