import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';

// BUG-365: App Router keeps the app layout, and its subscription gate, across
// client navigation. A page whose own data check finds no subscription sends
// the learner to Pricing, which states the reason from their entitlement.
export function redirectIfUnsubscribed(
  results: readonly ActionResult<unknown>[],
): void {
  if (
    results.some((result) => !result.ok && result.error.code === 'UNSUBSCRIBED')
  ) {
    redirect(`${ROUTES.PRICING}?reason=subscription_required`);
  }
}
