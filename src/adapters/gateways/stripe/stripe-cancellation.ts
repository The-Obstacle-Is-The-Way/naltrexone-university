// Whether a Stripe subscription stops before it would next renew. Stripe
// records a scheduled cancellation in two ways: cancel_at_period_end, or a
// cancel_at timestamp. The Billing portal uses cancel_at, set to the period
// end, and leaves cancel_at_period_end false (DEBT-414 F04), so reading only
// the flag would miss every portal cancellation. A cancel_at after the period
// end still renews once, so it does not count.
export function stripeSubscriptionEndsByPeriodEnd(subscription: {
  cancel_at_period_end: boolean;
  cancel_at?: number | null | undefined;
  current_period_end: number;
}): boolean {
  if (subscription.cancel_at_period_end) return true;
  const cancelAt = subscription.cancel_at ?? null;
  return cancelAt !== null && cancelAt <= subscription.current_period_end;
}
