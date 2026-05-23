/**
 * Attempt entity - a user's answer to a question.
 */

import { DomainError } from '../errors';
import type { AnswerOutcome } from '../value-objects';

export const AllAttemptRetryOrigins = [
  'history',
  'dashboard',
  'bookmarks',
  'session_review',
  'other',
] as const;

export type AttemptRetryOrigin = (typeof AllAttemptRetryOrigins)[number];

export function isValidAttemptRetryOrigin(
  value: string,
): value is AttemptRetryOrigin {
  return AllAttemptRetryOrigins.includes(value as AttemptRetryOrigin);
}

export function isValidAttemptProvenance(input: {
  retryOfAttemptId: string | null;
  retryOrigin: AttemptRetryOrigin | null;
  retrySessionId: string | null;
}): boolean {
  if (input.retryOrigin === null) {
    return input.retryOfAttemptId === null && input.retrySessionId === null;
  }

  if (input.retryOrigin === 'session_review') {
    return input.retrySessionId !== null;
  }

  return input.retryOfAttemptId !== null && input.retrySessionId === null;
}

export type Attempt = {
  readonly id: string;
  readonly userId: string;
  readonly questionId: string;
  readonly practiceSessionId: string | null;
  readonly outcome: AnswerOutcome;
  readonly isCorrect: boolean;
  readonly timeSpentSeconds: number;
  readonly retryOfAttemptId: string | null;
  readonly retryOrigin: AttemptRetryOrigin | null;
  readonly retrySessionId: string | null;
  readonly answeredAt: Date;
};

export function createAttempt(input: Attempt): Attempt {
  if (input.outcome.kind === 'omitted' && input.isCorrect) {
    throw new DomainError(
      'INVALID_ATTEMPT',
      'Omitted attempts must be incorrect',
    );
  }

  return input;
}
