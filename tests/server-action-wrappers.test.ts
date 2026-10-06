import { describe, expect, it } from 'vitest';
import { manageBillingAction as manageBillingFromApp } from '@/app/(app)/app/billing/manage-billing-actions';
import { removeBookmarkAction } from '@/app/(app)/app/bookmarks/bookmarks-actions';
import { createTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-actions';
import { manageBillingAction as manageBillingFromPricing } from '@/app/pricing/manage-billing-actions';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import { ROUTES, toPricingRoute } from '@/lib/routes';

// Where Next's real redirect sends the browser: its digest reads
// NEXT_REDIRECT;<type>;<url>;<status>;.
async function redirectTarget(
  action: (formData: FormData) => Promise<unknown>,
): Promise<string> {
  try {
    await action(new FormData());
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT;'))
      return digest.split(';')[2] ?? '';
    throw error;
  }
  throw new Error('expected a redirect');
}

// The exported actions are thin: they pass the form data to their own logic
// module with production dependencies, and their tests inject through that
// module. Each redirect target below belongs to one logic module.
describe('exported server action wrappers', () => {
  it.each([
    [
      'removeBookmarkAction',
      removeBookmarkAction,
      `${ROUTES.APP_BOOKMARKS}?error=missing_question_id`,
    ],
    [
      'subscribeMonthlyAction',
      subscribeMonthlyAction,
      toPricingRoute({ checkout: 'error', plan: 'monthly' }),
    ],
    [
      'subscribeAnnualAction',
      subscribeAnnualAction,
      toPricingRoute({ checkout: 'error', plan: 'annual' }),
    ],
    [
      'createTrialPaymentMethodAction',
      createTrialPaymentMethodAction,
      `${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
    ],
  ])(
    '%s rejects an empty form at its own page',
    async (_name, action, target) => {
      expect(await redirectTarget(action)).toBe(target);
    },
  );

  // The unit environment has no app configuration, so the billing controller
  // cannot load its dependencies and each copy redirects to its failure page.
  it.each([
    ['pricing', manageBillingFromPricing, toPricingRoute({ portal: 'error' })],
    [
      'app billing',
      manageBillingFromApp,
      `${ROUTES.APP_BILLING}?error=portal_failed`,
    ],
  ])(
    'the %s manageBillingAction reaches its own failure page',
    async (_where, action, target) => {
      expect(await redirectTarget(action)).toBe(target);
    },
  );

  it.each([
    ['removeBookmarkAction', removeBookmarkAction],
    ['subscribeMonthlyAction', subscribeMonthlyAction],
    ['subscribeAnnualAction', subscribeAnnualAction],
    ['createTrialPaymentMethodAction', createTrialPaymentMethodAction],
    ['the pricing manageBillingAction', manageBillingFromPricing],
    ['the app billing manageBillingAction', manageBillingFromApp],
  ])(
    '%s does nothing when its input is not form data',
    async (_name, action) => {
      // A client can send any value; Reflect.apply calls the action as it would.
      await expect(
        Reflect.apply(action, undefined, [{ get: () => 'x' }]),
      ).resolves.toBeUndefined();
    },
  );
});
