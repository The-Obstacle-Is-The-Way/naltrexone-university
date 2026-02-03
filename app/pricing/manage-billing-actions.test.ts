import { describe, expect, it, vi } from 'vitest';
import { manageBillingAction } from '@/app/pricing/manage-billing-actions';
import { err, ok } from '@/src/adapters/controllers/action-result';

function createRedirectFn() {
  return vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  });
}

describe('app/pricing/manage-billing-actions', () => {
  it('redirects to the portal url when portal session creation succeeds', async () => {
    const createPortalSessionFn = vi.fn(async () =>
      ok({ url: 'https://stripe.test/portal' }),
    );

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

  it('redirects to sign-up when portal session creation is unauthenticated', async () => {
    const createPortalSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

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
