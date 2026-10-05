import { useEffect } from 'react';
import {
  claimStaleActionReload,
  isStaleServerActionError,
  readSessionStorage,
} from '@/lib/stale-server-action';

/**
 * Reloads the page once when the error is a server action this deployment no
 * longer has (BUG-319). A reload fetches the new build, so the person's next
 * try works; the guard stops a page from reloading in a loop.
 */
export function useStaleServerActionReload(
  error: unknown,
  reloadPage: () => void,
): void {
  useEffect(() => {
    if (
      isStaleServerActionError(error) &&
      claimStaleActionReload(readSessionStorage(), Date.now())
    ) {
      reloadPage();
    }
  }, [error, reloadPage]);
}
