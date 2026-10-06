import { describe, expect, it, vi } from 'vitest';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import { subscribeToPlan } from '@/app/pricing/subscribe-to-plan';
import {
  AUTH_REDIRECT_QUERY_PARAM,
  ROUTES,
  toPricingRoute,
  toSignUpRedirectRoute,
} from '@/lib/routes';
import { err, ok } from '@/src/adapters/controllers/action-result';

function createRedirectFn() {
  return vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  });
}

function createConsentForm(): FormData {
  const data = new FormData();
  data.set('hasTrial', 'true');
  data.set('disclosureVersion', '2026-09-16');
  data.set('renewalOptIn', 'yes');
  return data;
}

describe('app/pricing/subscribe-actions', () => {
  it('subscribes monthly via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeToPlan('monthly', createConsentForm(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
      renewalOptIn: true,
    });
  });

  it('subscribes annual via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeToPlan('annual', createConsentForm(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/annual',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'annual',
      idempotencyKey: undefined,
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
      renewalOptIn: true,
    });
  });

  it('preserves the selected plan and return destination when redirecting an unauthenticated checkout attempt', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeToPlan('monthly', createConsentForm(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: `redirect:${toSignUpRedirectRoute(
        toPricingRoute({ plan: 'monthly' }),
      )}`,
    });

    const redirectUrl = redirectFn.mock.calls[0]?.[0];
    if (!redirectUrl) throw new Error('Expected redirect url');
    const url = new URL(redirectUrl, 'https://example.com');
    expect(url.pathname).toBe(ROUTES.SIGN_UP);
    expect(url.searchParams.get(AUTH_REDIRECT_QUERY_PARAM)).toBe(
      toPricingRoute({ plan: 'monthly' }),
    );
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
      renewalOptIn: true,
    });
  });

  it('redirects back to pricing when checkout session fails', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Boom'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeToPlan('monthly', createConsentForm(), {
        createCheckoutSessionFn,
        redirectFn,
        logError: () => undefined,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/pricing?checkout=error&plan=monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
      renewalOptIn: true,
    });
  });

  it('redirects back to pricing when checkout session fails with default logError', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Boom'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeToPlan('monthly', createConsentForm(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/pricing?checkout=error&plan=monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
      renewalOptIn: true,
    });
  });

  it('passes idempotencyKey from the form data to the checkout controller', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      ok({ url: 'https://checkout/monthly' }),
    );
    const redirectFn = createRedirectFn();

    const formData = createConsentForm();
    formData.set('idempotencyKey', '11111111-1111-1111-1111-111111111111');

    await expect(
      subscribeToPlan('monthly', formData, {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
      renewalOptIn: true,
    });
  });

  it.each(['monthly', 'annual'] as const)(
    'rejects a %s browser submit without displayed consent identity',
    async (plan) => {
      const createCheckoutSessionFn = vi.fn(async () =>
        ok({ url: 'https://checkout/unexpected' }),
      );
      const redirectFn = createRedirectFn();
      await expect(
        subscribeToPlan(plan, new FormData(), {
          createCheckoutSessionFn,
          redirectFn,
        }),
      ).rejects.toThrow('redirect:/pricing?checkout=error&plan=');
      expect(createCheckoutSessionFn).not.toHaveBeenCalled();
    },
  );

  // DEBT-414 F03: the browser requires the opt-in; the server does too.
  it.each([
    ['missing', null],
    ['not the affirmative value', 'no'],
  ])(
    'rejects a submission whose renewal opt-in is %s without creating Checkout',
    async (_case, value) => {
      const createCheckoutSessionFn = vi.fn(async () =>
        ok({ url: 'https://checkout/monthly' }),
      );
      const redirectFn = createRedirectFn();
      const form = createConsentForm();
      if (value === null) form.delete('renewalOptIn');
      else form.set('renewalOptIn', value);

      await expect(
        subscribeToPlan('monthly', form, {
          createCheckoutSessionFn,
          redirectFn,
        }),
      ).rejects.toMatchObject({
        message: `redirect:${toPricingRoute({ checkout: 'error', plan: 'monthly' })}`,
      });
      expect(createCheckoutSessionFn).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed trial identity without creating Checkout', async () => {
    const data = createConsentForm();
    data.set('hasTrial', 'yes');
    const createCheckoutSessionFn = vi.fn(async () =>
      ok({ url: 'https://checkout/unexpected' }),
    );
    await expect(
      subscribeToPlan('monthly', data, {
        createCheckoutSessionFn,
        redirectFn: createRedirectFn(),
      }),
    ).rejects.toThrow('redirect:/pricing?checkout=error&plan=monthly');
    expect(createCheckoutSessionFn).not.toHaveBeenCalled();
  });

  it('does not include internal error params in redirect urls even in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const longMessage = 'x'.repeat(250);

      type CreateCheckoutSessionFn = Parameters<
        typeof runSubscribeAction
      >[1]['createCheckoutSessionFn'];
      const createCheckoutSessionFn = vi.fn<CreateCheckoutSessionFn>(async () =>
        err('INTERNAL_ERROR', longMessage),
      );

      const redirectFn = createRedirectFn();
      const logError = vi.fn();

      await expect(
        runSubscribeAction(
          { plan: 'monthly', idempotencyKey: 'idem_1', renewalOptIn: true },
          {
            createCheckoutSessionFn,
            redirectFn,
            logError,
          },
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('redirect:/pricing?'),
      });

      const redirectUrl = redirectFn.mock.calls[0]?.[0];
      if (!redirectUrl) throw new Error('Expected redirect url');

      const url = new URL(redirectUrl, 'https://example.com');
      expect(url.pathname).toBe('/pricing');
      expect(url.searchParams.get('checkout')).toBe('error');
      expect(url.searchParams.get('plan')).toBe('monthly');
      expect(url.searchParams.get('error_code')).toBeNull();
      expect(url.searchParams.get('error_message')).toBeNull();

      // BUG-325: the key is the caller's text, so only its length is logged.
      expect(logError).toHaveBeenCalledWith(
        {
          plan: 'monthly',
          idempotencyKeyLength: 6,
          errorCode: 'INTERNAL_ERROR',
          errorMessage: longMessage,
        },
        'Stripe checkout failed',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // BUG-325: a refused input is the caller's mistake, a forgery, or an offer
  // that changed since the page loaded. It is not a checkout failure, so it is
  // a warning with bounded content, never the caller's text.
  it('warns about a refused input, with its length, instead of logging an error', async () => {
    const logError = vi.fn();
    const logWarn = vi.fn();
    const redirectFn = createRedirectFn();

    await expect(
      runSubscribeAction(
        {
          plan: 'annual',
          idempotencyKey: 'x'.repeat(5000),
          renewalOptIn: true,
        },
        {
          createCheckoutSessionFn: async () =>
            err('VALIDATION_ERROR', 'Invalid input'),
          redirectFn,
          logError,
          logWarn,
        },
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('redirect:/pricing?'),
    });

    expect(redirectFn).toHaveBeenCalledWith(
      '/pricing?checkout=error&plan=annual',
    );
    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      {
        plan: 'annual',
        idempotencyKeyLength: 5000,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid input',
      },
      'Stripe checkout refused its input',
    );
  });

  // A client can call an exported server action with any arguments, so the
  // exported actions take only their form data; tests inject through
  // subscribeToPlan.
  it.each([subscribeMonthlyAction, subscribeAnnualAction])(
    'exports an action that takes only its form data',
    async (action) => {
      expect(action.length).toBe(1);
      await expect(action(new FormData())).rejects.toThrow('NEXT_REDIRECT');
    },
  );
});
