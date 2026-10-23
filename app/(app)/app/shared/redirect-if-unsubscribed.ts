import { redirect } from 'next/navigation';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { UNSUBSCRIBED_PRICING_HREF } from './redirect-on-unsubscribed';

// BUG-365: App Router keeps the app layout, and its subscription gate, across
// client navigation. A page whose own data check finds no subscription sends
// the learner to Pricing, which states the reason from their entitlement.
export function redirectIfUnsubscribed(
  results: readonly ActionResult<unknown>[],
): void {
  if (
    results.some((result) => !result.ok && result.error.code === 'UNSUBSCRIBED')
  ) {
    redirect(UNSUBSCRIBED_PRICING_HREF);
  }
}
