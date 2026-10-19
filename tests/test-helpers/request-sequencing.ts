import type { RequestSequencingHooks } from '@/app/(app)/app/practice/shared/question-flow-actions';

/** A request family for tests that exercise the flow helpers directly. */
export function createRequestSequencing(): RequestSequencingHooks {
  let latest = 0;
  return {
    createRequestSequenceId: () => ++latest,
    isLatestRequest: (requestId) => requestId === latest,
  };
}
