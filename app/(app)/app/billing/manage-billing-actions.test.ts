import { describe, expect, it } from 'vitest';
import { manageBillingAction } from '@/app/(app)/app/billing/manage-billing-actions';
import { ROUTES } from '@/lib/routes';
import { err, ok } from '@/src/adapters/controllers/action-result';

function createRedirectFn(): (url: string) => never {
  return (url: string): never => {
    throw new Error(`redirect:${url}`);
  };
}

describe('app/(app)/app/billing/manage-billing-actions', () => {
  it('redirects to the Stripe portal when portal session creation succeeds', async () => {
    const createPortalSessionFn = async () =>
      ok({ url: 'https://stripe.test/portal' });

    const redirectFn = createRedirectFn();

    await expect(
      manageBillingAction(new FormData(), {
        createPortalSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://stripe.test/portal',
    });
  });

  it('redirects back to billing with portal_failed when portal session creation fails', async () => {
    const createPortalSessionFn = async () => err('INTERNAL_ERROR', 'Boom');

    const redirectFn = createRedirectFn();

    await expect(
      manageBillingAction(new FormData(), {
        createPortalSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BILLING}?error=portal_failed`,
    });
  });
});
