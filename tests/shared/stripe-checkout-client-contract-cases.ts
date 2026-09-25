export const STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES = [
  'replays a frozen create response while retrieve exposes terminal live state',
  'lists Sessions in reverse chronology with starting_after and has_more',
  'keeps terminal Sessions visible in unfiltered listings',
  'rejects an idempotency key reused with different parameters',
  "lists a customer's Subscriptions by id and status and retrieves them by id",
  'cancels a Subscription once and rejects a repeat cancel as resource_missing',
] as const;
