import { describe, expect, it, vi } from 'vitest';
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

  it('passes idempotencyKey from form data to the portal controller', async () => {
    const createPortalSessionFn = vi.fn(async () =>
      ok({ url: 'https://stripe.test/portal' }),
    );
    const redirectFn = createRedirectFn();
    const formData = new FormData();
    formData.set('idempotencyKey', '11111111-1111-1111-1111-111111111111');

    await expect(
      manageBillingAction(formData, {
        createPortalSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://stripe.test/portal',
    });

    expect(createPortalSessionFn).toHaveBeenCalledWith({
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    });
  });
});
