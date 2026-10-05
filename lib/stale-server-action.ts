// BUG-319: a page rendered before a deploy can call a server action the new
// deployment no longer has. Next.js then throws UnrecognizedActionError, and
// only a full reload, which fetches the new build, recovers.

export const STALE_ACTION_RELOAD_KEY = 'bug-319-stale-action-reload-at';
export const STALE_ACTION_RELOAD_WINDOW_MS = 60_000;

type ReloadMarkerStore = Pick<Storage, 'getItem' | 'setItem'>;

// Matches by name, which Next.js sets on its class. Its own detector is still
// unstable_, and the test pins this check against the real class.
export function isStaleServerActionError(error: unknown): boolean {
  return error instanceof Error && error.name === 'UnrecognizedActionError';
}

/**
 * Records a reload and returns true, unless one was recorded within the
 * window. Without working storage nothing could stop a reload loop, so it
 * returns false and the error page shows instead.
 */
export function claimStaleActionReload(
  store: ReloadMarkerStore | undefined,
  now: number,
): boolean {
  if (!store) return false;
  try {
    // None of these blocks the reload: a missing marker reads as 0 (a gap of
    // the whole clock), an unreadable one gives NaN, and one in the future
    // (the clock moved back) a negative gap.
    const elapsed = now - Number(store.getItem(STALE_ACTION_RELOAD_KEY));
    if (elapsed >= 0 && elapsed < STALE_ACTION_RELOAD_WINDOW_MS) {
      return false;
    }
    store.setItem(STALE_ACTION_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

// Reading sessionStorage throws when site data is blocked.
export function readSessionStorage(
  source: { readonly sessionStorage: ReloadMarkerStore } = window,
): ReloadMarkerStore | undefined {
  try {
    return source.sessionStorage;
  } catch {
    return undefined;
  }
}
