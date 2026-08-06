import { describe, expect, it, vi } from 'vitest';
import { createTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-actions';
import { ROUTES } from '@/lib/routes';
import { err, ok } from '@/src/adapters/controllers/action-result';

function createRedirectFn() {
  return vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  });
}

describe('trial-payment-method-actions', () => {
  it('redirects to the setup session and passes the form idempotency key', async () => {
    const createSessionFn = vi.fn(async () =>
      ok({ url: 'https://stripe.test/setup' }),
    );
    const formData = new FormData();
    formData.set('idempotencyKey', '11111111-1111-1111-1111-111111111111');

    await expect(
      createTrialPaymentMethodAction(formData, {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow('redirect:https://stripe.test/setup');

    expect(createSessionFn).toHaveBeenCalledWith({
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('redirects unauthenticated users to sign up', async () => {
    const createSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

    await expect(
      createTrialPaymentMethodAction(new FormData(), {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow(`redirect:${ROUTES.SIGN_UP}`);
  });

  it('redirects setup failures to Billing without exposing error details', async () => {
    const createSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'provider secret'),
    );

    await expect(
      createTrialPaymentMethodAction(new FormData(), {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow(
      `redirect:${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
    );
  });
});
