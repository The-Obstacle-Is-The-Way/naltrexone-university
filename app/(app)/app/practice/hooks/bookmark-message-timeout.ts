type BookmarkMessageTimeoutRef = {
  current: ReturnType<typeof setTimeout> | null;
};

type SetTimeoutLike = (
  callback: () => void,
  delayMs: number,
) => ReturnType<typeof setTimeout>;

type ClearTimeoutLike = (timeoutId: ReturnType<typeof setTimeout>) => void;

const DEFAULT_BOOKMARK_MESSAGE_TIMEOUT_MS = 2000;

export function scheduleBookmarkMessageAutoClear(input: {
  timeoutIdRef: BookmarkMessageTimeoutRef;
  setBookmarkMessage: (message: string | null) => void;
  isMounted: () => boolean;
  delayMs?: number;
  setTimeoutFn?: SetTimeoutLike;
  clearTimeoutFn?: ClearTimeoutLike;
}): void {
  const setTimeoutFn = input.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = input.clearTimeoutFn ?? clearTimeout;
  const delayMs = input.delayMs ?? DEFAULT_BOOKMARK_MESSAGE_TIMEOUT_MS;

  if (input.timeoutIdRef.current) {
    clearTimeoutFn(input.timeoutIdRef.current);
  }

  input.timeoutIdRef.current = setTimeoutFn(() => {
    if (!input.isMounted()) return;
    input.setBookmarkMessage(null);
  }, delayMs);
}
