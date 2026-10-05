import type { UngradedReason } from '@/src/domain/services';

// ADR-022 Amendment 2026-10-05 (DEBT-498): the words an ungraded review uses
// in place of a verdict and its colors.

export const NOT_SCORED = 'Not scored';

export const YOUR_ANSWER = 'Your answer';

/** The key of the revision answered, named by why it is not graded. */
export const KEY_NAME: Readonly<Record<UngradedReason, string>> = {
  key_corrected: 'Answer before the correction',
  in_doubt: 'Keyed answer',
};
