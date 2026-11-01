// BUG-364 (DEBT-414 F22): how a trial ends decides what the app may say about
// it. A scheduled cancellation ends the trial without a charge even when a
// card is saved, so the app must neither promise a renewal nor offer a card.
export type TrialEnding =
  | 'cancellationScheduled'
  | 'renewsOnSavedCard'
  | 'needsCard';

export function classifyTrialEnding(input: {
  cancelAtPeriodEnd: boolean;
  cardSaved: boolean;
}): TrialEnding {
  if (input.cancelAtPeriodEnd) return 'cancellationScheduled';
  return input.cardSaved ? 'renewsOnSavedCard' : 'needsCard';
}
