import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { shouldReportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

const BOOKMARKS_LOAD_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;
const MAX_BOOKMARK_LOAD_RETRY_COUNT = 2;
const BOOKMARK_LOAD_RETRY_BACKOFF_BASE_MS = 1000;

type SetTimeoutFn = (
  fn: () => void,
  ms: number,
) => ReturnType<typeof setTimeout>;

type ClearTimeoutFn = (id: ReturnType<typeof setTimeout>) => void;

export function createBookmarksEffect(input: {
  bookmarkRetryCount: number;
  getBookmarkQuestionIdsFn: (input: unknown) => Promise<
    ActionResult<{
      questionIds: string[];
    }>
  >;
  setBookmarkedQuestionIds: (
    next: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  setBookmarkStatus: (status: 'idle' | 'loading' | 'error') => void;
  setBookmarkRetryCount: (next: number | ((prev: number) => number)) => void;
  setTimeoutFn?: SetTimeoutFn;
  clearTimeoutFn?: ClearTimeoutFn;
  logError: (message: string, context: unknown) => void;
}): () => void {
  const setTimeoutFn: SetTimeoutFn =
    input.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn: ClearTimeoutFn =
    input.clearTimeoutFn ?? ((id) => clearTimeout(id));
  const logError = input.logError;

  let mounted = true;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const handleBookmarkLoadFailure = (error: unknown) => {
    if (shouldReportClientError(error)) {
      logError('Failed to load bookmarks', error);
    }
    input.setBookmarkStatus('error');

    if (input.bookmarkRetryCount < MAX_BOOKMARK_LOAD_RETRY_COUNT) {
      timeoutId = setTimeoutFn(
        () => {
          if (mounted) {
            input.setBookmarkRetryCount((prev) => prev + 1);
          }
        },
        BOOKMARK_LOAD_RETRY_BACKOFF_BASE_MS * (input.bookmarkRetryCount + 1),
      );
    }
  };

  void (async () => {
    input.setBookmarkStatus('loading');
    let res: ActionResult<{ questionIds: string[] }>;
    try {
      res = await withTimeout(
        input.getBookmarkQuestionIdsFn({}),
        BOOKMARKS_LOAD_TIMEOUT_MS,
      );
    } catch (error) {
      if (!mounted) return;
      handleBookmarkLoadFailure(error);
      return;
    }
    if (!mounted) return;

    if (!res.ok) {
      handleBookmarkLoadFailure(res.error);
      return;
    }

    input.setBookmarkedQuestionIds(new Set(res.data.questionIds));
    input.setBookmarkStatus('idle');
  })();

  return () => {
    mounted = false;
    if (timeoutId !== undefined) clearTimeoutFn(timeoutId);
  };
}
