import { describe, expect, it, vi } from 'vitest';
import { executeCreateTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-action-handler';
import * as trialPaymentMethodActions from '@/app/(app)/app/trial-payment-method-actions';
import { createTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-actions';
import { ROUTES } from '@/lib/routes';
import { err, ok } from '@/src/adapters/controllers/action-result';

// DEBT-414 F03b: the add-card dialog posts the displayed terms' version and
// the separate renewal opt-in.
function createConsentForm(): FormData {
  const formData = new FormData();
  formData.set('disclosureVersion', '2026-09-28.2');
  formData.set('renewalOptIn', 'yes');
  return formData;
}

function createRedirectFn() {
  return vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  });
}

describe('trial-payment-method-actions', () => {
  it('exports a one-argument server action boundary', () => {
    expect(createTrialPaymentMethodAction).toHaveLength(1);
    expect(Object.keys(trialPaymentMethodActions)).toEqual([
      'createTrialPaymentMethodAction',
    ]);
  });

  it('redirects to the setup session and passes the form idempotency key', async () => {
    const createSessionFn = vi.fn(async () =>
      ok({ url: 'https://stripe.test/setup' }),
    );
    const formData = createConsentForm();
    formData.set('idempotencyKey', '11111111-1111-1111-1111-111111111111');

    await expect(
      executeCreateTrialPaymentMethodAction(formData, {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow('redirect:https://stripe.test/setup');

    expect(createSessionFn).toHaveBeenCalledWith({
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
      expectedDisclosureVersion: '2026-09-28.2',
      renewalOptIn: true,
    });
  });

  it('redirects unauthenticated users to sign up', async () => {
    const createSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

    await expect(
      executeCreateTrialPaymentMethodAction(createConsentForm(), {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow(`redirect:${ROUTES.SIGN_UP}`);
  });

  it('rejects a malformed idempotency key before the controller call', async () => {
    const createSessionFn = vi.fn(async () =>
      ok({ url: 'https://stripe.test/setup' }),
    );
    const formData = createConsentForm();
    formData.set('idempotencyKey', 'not-a-uuid');

    await expect(
      executeCreateTrialPaymentMethodAction(formData, {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow(
      `redirect:${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
    );
    expect(createSessionFn).not.toHaveBeenCalled();
  });

  it.each([
    ['the renewal opt-in is missing', 'renewalOptIn', null],
    ['the renewal opt-in is not affirmative', 'renewalOptIn', 'no'],
    ['the displayed version is missing', 'disclosureVersion', null],
    ['the displayed version is malformed', 'disclosureVersion', 'latest'],
  ])(
    'returns to Billing without a setup session when %s',
    async (_case, field, value) => {
      const createSessionFn = vi.fn(async () =>
        ok({ url: 'https://stripe.test/setup' }),
      );
      const formData = createConsentForm();
      if (value === null) formData.delete(field);
      else formData.set(field, value);

      await expect(
        executeCreateTrialPaymentMethodAction(formData, {
          createSessionFn,
          redirectFn: createRedirectFn(),
        }),
      ).rejects.toThrow(
        `redirect:${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
      );
      expect(createSessionFn).not.toHaveBeenCalled();
    },
  );

  it('redirects setup failures to Billing without exposing error details', async () => {
    const createSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'provider secret'),
    );

    await expect(
      executeCreateTrialPaymentMethodAction(createConsentForm(), {
        createSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow(
      `redirect:${ROUTES.APP_BILLING}?error=trial_payment_method_failed`,
    );
  });
});
