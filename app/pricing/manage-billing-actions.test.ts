import { describe, expect, it } from 'vitest';
import { manageBillingAction } from '@/app/pricing/manage-billing-actions';
import { err, ok } from '@/src/adapters/controllers/action-result';

function createRedirectFn(): (url: string) => never {
  return (url: string): never => {
    throw new Error(`redirect:${url}`);
  };
}

describe('app/pricing/manage-billing-actions', () => {
  it('returns redirect to portal url when portal session creation succeeds', async () => {
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

  it('returns redirect to sign-up when portal session creation is unauthenticated', async () => {
    const createPortalSessionFn = async () =>
      err('UNAUTHENTICATED', 'Not signed in');

    const redirectFn = createRedirectFn();

    await expect(
      manageBillingAction(new FormData(), {
        createPortalSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/sign-up',
    });
  });
});
