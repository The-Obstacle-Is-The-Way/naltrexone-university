import { toPricingRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

// Pricing states the reason from the learner's own entitlement, so one target
// serves an ended trial, an inactive subscription and a trial never started.
export const UNSUBSCRIBED_PRICING_HREF = toPricingRoute({
  reason: 'subscription_required',
});

// Like the server pages' redirect(), Pricing replaces the refused page in history.
function replaceLocation(url: string): void {
  window.location.replace(url);
}

// BUG-365: App Router keeps the app layout, and its subscription gate, across
// client navigation. When an action finds no subscription, a full navigation
// leaves that layout for Pricing. The result is still returned to the caller.
export function redirectOnUnsubscribed<TResult extends ActionResult<unknown>>(
  action: (input: unknown) => Promise<TResult>,
  navigate: (url: string) => void = replaceLocation,
): (input: unknown) => Promise<TResult> {
  return async (input) => {
    const result = await action(input);
    if (!result.ok && result.error.code === 'UNSUBSCRIBED') {
      navigate(UNSUBSCRIBED_PRICING_HREF);
    }
    return result;
  };
}
