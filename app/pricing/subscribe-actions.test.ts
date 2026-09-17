import { describe, expect, it, vi } from 'vitest';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
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
  return data;
}

describe('app/pricing/subscribe-actions', () => {
  it('subscribes monthly via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(createConsentForm(), {
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
    });
  });

  it('subscribes annual via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeAnnualAction(createConsentForm(), {
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
    });
  });

  it('preserves the selected plan and return destination when redirecting an unauthenticated checkout attempt', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(createConsentForm(), {
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
    });
  });

  it('redirects back to pricing when checkout session fails', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Boom'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(createConsentForm(), {
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
    });
  });

  it('redirects back to pricing when checkout session fails with default logError', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Boom'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(createConsentForm(), {
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
      subscribeMonthlyAction(formData, { createCheckoutSessionFn, redirectFn }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
      expectedOffer: { hasTrial: true, disclosureVersion: '2026-09-16' },
    });
  });

  it.each([subscribeMonthlyAction, subscribeAnnualAction])(
    'rejects a browser submit without displayed consent identity',
    async (action) => {
      const createCheckoutSessionFn = vi.fn(async () =>
        ok({ url: 'https://checkout/unexpected' }),
      );
      const redirectFn = createRedirectFn();
      await expect(
        action(new FormData(), { createCheckoutSessionFn, redirectFn }),
      ).rejects.toThrow('redirect:/pricing?checkout=error&plan=');
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
      subscribeMonthlyAction(data, {
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
          { plan: 'monthly', idempotencyKey: 'idem_1' },
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

      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'monthly',
          idempotencyKey: 'idem_1',
          errorCode: 'INTERNAL_ERROR',
        }),
        'Stripe checkout failed',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
