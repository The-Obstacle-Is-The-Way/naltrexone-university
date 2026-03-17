import { STANDARD_READ_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { shouldReportClientError } from '@/lib/report-client-error';
import { withTimeout } from '@/lib/with-timeout';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

const TAGS_LOAD_TIMEOUT_MS = STANDARD_READ_TIMEOUT_MS;

export function createTagsEffect<T>(input: {
  getTagsFn: (input: unknown) => Promise<ActionResult<{ rows: T[] }>>;
  setTagLoadStatus: (status: 'idle' | 'loading' | 'error') => void;
  setAvailableTags: (tags: T[]) => void;
  logError: (message: string, context: unknown) => void;
}): () => void {
  let mounted = true;
  const logError = input.logError;

  input.setTagLoadStatus('loading');

  void (async () => {
    let res: Awaited<ReturnType<typeof input.getTagsFn>>;
    try {
      res = await withTimeout(input.getTagsFn({}), TAGS_LOAD_TIMEOUT_MS);
    } catch (error) {
      if (!mounted) return;
      logError('Failed to load tags', error);
      input.setTagLoadStatus('error');
      return;
    }
    if (!mounted) return;

    if (!res.ok) {
      if (shouldReportClientError(res.error)) {
        logError('Failed to load tags', res.error);
      }
      input.setTagLoadStatus('error');
      return;
    }

    input.setAvailableTags(res.data.rows);
    input.setTagLoadStatus('idle');
  })();

  return () => {
    mounted = false;
  };
}
