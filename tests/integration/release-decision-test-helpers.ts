import type { DecisionRecord } from '@/scripts/seed/qid-command-args';

// DEBT-490: every activation names why, and on whose authority. Suites that
// are not about that record share this one; the attribution suite uses its own.
export const RELEASE_DECISION: DecisionRecord = {
  reason: 'Integration test',
  authority: 'Test suite',
};
