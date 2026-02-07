import type { ActionResult } from '@/src/adapters/controllers/action-result';

type SetTimeoutFn = (
  fn: () => void,
  ms: number,
) => ReturnType<typeof setTimeout>;

type ClearTimeoutFn = (id: ReturnType<typeof setTimeout>) => void;

export function createBookmarksEffect(input: {
  bookmarkRetryCount: number;
  getBookmarksFn: (input: unknown) => Promise<
    ActionResult<{
      rows: Array<{ questionId: string }>;
    }>
  >;
  setBookmarkedQuestionIds: (
    next: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  setBookmarkStatus: (status: 'idle' | 'loading' | 'error') => void;
  setBookmarkRetryCount: (next: number | ((prev: number) => number)) => void;
  setTimeoutFn?: SetTimeoutFn;
  clearTimeoutFn?: ClearTimeoutFn;
  logError?: (message: string, context: unknown) => void;
}): () => void {
  const setTimeoutFn: SetTimeoutFn =
    input.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn: ClearTimeoutFn =
    input.clearTimeoutFn ?? ((id) => clearTimeout(id));
  const logError =
    input.logError ??
    ((message: string, context: unknown) => {
      console.error(message, context);
    });

  let mounted = true;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  void (async () => {
    let res: ActionResult<{ rows: Array<{ questionId: string }> }>;
    try {
      res = await input.getBookmarksFn({});
    } catch (error) {
      if (!mounted) return;

      logError('Failed to load bookmarks', error);
      input.setBookmarkStatus('error');

      if (input.bookmarkRetryCount < 2) {
        timeoutId = setTimeoutFn(
          () => {
            if (mounted) {
              input.setBookmarkRetryCount((prev) => prev + 1);
            }
          },
          1000 * (input.bookmarkRetryCount + 1),
        );
      }

      return;
    }
    if (!mounted) return;

    if (!res.ok) {
      logError('Failed to load bookmarks', res.error);
      input.setBookmarkStatus('error');

      if (input.bookmarkRetryCount < 2) {
        timeoutId = setTimeoutFn(
          () => {
            if (mounted) {
              input.setBookmarkRetryCount((prev) => prev + 1);
            }
          },
          1000 * (input.bookmarkRetryCount + 1),
        );
      }

      return;
    }

    input.setBookmarkedQuestionIds(
      new Set(res.data.rows.map((row) => row.questionId)),
    );
    input.setBookmarkStatus('idle');
  })();

  return () => {
    mounted = false;
    if (timeoutId !== undefined) clearTimeoutFn(timeoutId);
  };
}
