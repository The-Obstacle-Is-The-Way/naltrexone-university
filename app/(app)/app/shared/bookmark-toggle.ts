import { shouldReportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

const TOGGLE_BOOKMARK_TIMEOUT_MS = 10_000;

export type BookmarkableQuestion = {
  questionId: string;
};

export async function toggleBookmarkForQuestion(input: {
  question: BookmarkableQuestion | null;
  bookmarkIdempotencyKey?: string | null;
  createIdempotencyKey?: () => string;
  setBookmarkIdempotencyKey?: (key: string) => void;
  toggleBookmarkFn: (
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
  const requestIdempotencyKey =
    input.bookmarkIdempotencyKey ?? input.createIdempotencyKey?.();

  if (!input.bookmarkIdempotencyKey && requestIdempotencyKey) {
    input.setBookmarkIdempotencyKey?.(requestIdempotencyKey);
  }

  input.setBookmarkStatus('loading');

  let res: ActionResult<{ bookmarked: boolean }>;
  try {
    res = await withTimeout(
      input.toggleBookmarkFn({
        questionId,
        idempotencyKey: requestIdempotencyKey ?? undefined,
      }),
      TOGGLE_BOOKMARK_TIMEOUT_MS,
    );
  } catch (error) {
    try {
      input.logError?.('Failed to toggle bookmark', error);
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
        input.logError?.('Failed to toggle bookmark', res.error);
      } catch {
        // Reporter failures must not block the primary error path.
      }
    }
    if (!isMounted()) return;
    input.onBookmarkError?.('Failed to save bookmark. Please try again.');
    input.setBookmarkStatus('error');
    return;
  }

  if (!isMounted()) return;

  input.setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (res.data.bookmarked) next.add(questionId);
    else next.delete(questionId);
    return next;
  });

  input.onBookmarkToggled?.(res.data.bookmarked);
  if (input.setBookmarkIdempotencyKey && input.createIdempotencyKey) {
    input.setBookmarkIdempotencyKey(input.createIdempotencyKey());
  }
  input.setBookmarkStatus('idle');
}
