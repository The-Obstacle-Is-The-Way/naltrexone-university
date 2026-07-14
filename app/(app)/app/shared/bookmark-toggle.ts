import { shouldReportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  IdempotentActionNames,
  rotateGeneratedIdempotencyKeyAfterDeterminateError,
} from '@/src/adapters/controllers/shared/idempotency-error-policy';
import {
  createRequestFingerprint,
  type FingerprintBoundIdempotencyKey,
  resolveRequestKey,
} from './idempotency-request-key';
import { STANDARD_MUTATION_TIMEOUT_MS } from './timeout-tiers';

const SET_BOOKMARK_TIMEOUT_MS = STANDARD_MUTATION_TIMEOUT_MS;

export type BookmarkableQuestion = {
  questionId: string;
};

export type BookmarkRequestToken = FingerprintBoundIdempotencyKey;

export function bookmarkRequestFingerprint(input: {
  questionId: string;
  desiredBookmarked: boolean;
}): string {
  return createRequestFingerprint([input.questionId, input.desiredBookmarked]);
}

export async function setBookmarkForQuestion(input: {
  question: BookmarkableQuestion | null;
  desiredBookmarked: boolean;
  bookmarkRequestToken?: BookmarkRequestToken | null;
  createIdempotencyKey?: () => string;
  setBookmarkRequestToken?: (token: BookmarkRequestToken | null) => void;
  setBookmarkFn: (
    input: unknown,
  ) => Promise<ActionResult<{ bookmarked: boolean }>>;
  setBookmarkStatus: (status: 'idle' | 'loading' | 'error') => void;
  setBookmarkedQuestionIds: (
    next: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  onBookmarkToggled?: (bookmarked: boolean) => void;
  onBookmarkError?: (message: string) => void;
  logError?: (message: string, context: unknown) => void;
  isMounted?: () => boolean;
}): Promise<void> {
  if (!input.question) return;

  const isMounted = input.isMounted ?? (() => true);
  const questionId = input.question.questionId;
  const fingerprint = bookmarkRequestFingerprint({
    questionId,
    desiredBookmarked: input.desiredBookmarked,
  });
  const requestIdempotencyKey = resolveRequestKey(
    input.bookmarkRequestToken,
    fingerprint,
    input.createIdempotencyKey,
    input.setBookmarkRequestToken,
  );

  input.setBookmarkStatus('loading');

  let res: ActionResult<{ bookmarked: boolean }>;
  try {
    res = await withTimeout(
      input.setBookmarkFn({
        questionId,
        bookmarked: input.desiredBookmarked,
        idempotencyKey: requestIdempotencyKey ?? undefined,
      }),
      SET_BOOKMARK_TIMEOUT_MS,
    );
  } catch (error) {
    try {
      input.logError?.('Failed to set bookmark', error);
    } catch {
      // Reporter failures must not block the primary error path.
    }
    if (!isMounted()) return;
    input.onBookmarkError?.('Failed to save bookmark. Please try again.');
    input.setBookmarkStatus('error');
    return;
  }

  if (!res.ok) {
    if (shouldReportClientError(res.error)) {
      try {
        input.logError?.('Failed to set bookmark', res.error);
      } catch {
        // Reporter failures must not block the primary error path.
      }
    }
    if (!isMounted()) return;
    rotateGeneratedIdempotencyKeyAfterDeterminateError(
      IdempotentActionNames.Bookmark,
      res.error,
      {
        createIdempotencyKey: input.createIdempotencyKey,
        setIdempotencyKey: input.setBookmarkRequestToken
          ? (key) => input.setBookmarkRequestToken?.({ key, fingerprint })
          : undefined,
      },
    );
    input.onBookmarkError?.('Failed to save bookmark. Please try again.');
    input.setBookmarkStatus('error');
    return;
  }

  if (!isMounted()) return;

  input.setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (input.desiredBookmarked) next.add(questionId);
    else next.delete(questionId);
    return next;
  });

  input.onBookmarkToggled?.(input.desiredBookmarked);
  input.setBookmarkRequestToken?.(null);
  input.setBookmarkStatus('idle');
}
