import {
  createRequestFingerprint,
  type FingerprintBoundIdempotencyKey,
} from './idempotency-request-key';

export type SubmitAnswerRequestToken = FingerprintBoundIdempotencyKey;

export type SubmitAnswerRetryIdentity = Readonly<{
  retryOfAttemptId: string | null;
  retryOrigin: string;
  retrySessionId: string | null;
}>;

/** The fields that can change the meaning or persistence context of a grade. */
export function submitAnswerRequestFingerprint(input: {
  questionId: string;
  selectedChoiceId: string;
  sessionId?: string | null;
  retryProvenance?: SubmitAnswerRetryIdentity | null;
}): string {
  return createRequestFingerprint([
    input.questionId,
    input.selectedChoiceId,
    input.sessionId ?? null,
    input.retryProvenance?.retryOfAttemptId ?? null,
    input.retryProvenance?.retryOrigin ?? null,
    input.retryProvenance?.retrySessionId ?? null,
  ]);
}
