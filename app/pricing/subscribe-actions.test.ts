import { describe, expect, it, vi } from 'vitest';
import { runSubscribeAction } from '@/app/pricing/subscribe-action';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import { err, ok } from '@/src/adapters/controllers/action-result';

function createRedirectFn() {
  return vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  });
}

describe('app/pricing/subscribe-actions', () => {
  it('subscribes monthly via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(new FormData(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('subscribes annual via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeAnnualAction(new FormData(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/annual',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'annual',
      idempotencyKey: undefined,
    });
  });

  it('redirects to sign-up when checkout session returns UNAUTHENTICATED', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(new FormData(), {
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/sign-up',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('redirects back to pricing when checkout session fails', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Boom'),
    );

    const redirectFn = createRedirectFn();

    await expect(
      subscribeMonthlyAction(new FormData(), {
        createCheckoutSessionFn,
        redirectFn,
        logError: () => undefined,
      }),
    ).rejects.toMatchObject({
      message:
        'redirect:/pricing?checkout=error&plan=monthly&error_code=INTERNAL_ERROR',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('passes idempotencyKey from the form data to the checkout controller', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      ok({ url: 'https://checkout/monthly' }),
    );
    const redirectFn = createRedirectFn();

    const formData = new FormData();
    formData.set('idempotencyKey', '11111111-1111-1111-1111-111111111111');

    await expect(
      subscribeMonthlyAction(formData, { createCheckoutSessionFn, redirectFn }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('includes a truncated error_message when checkout fails in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const longMessage = 'x'.repeat(250);

      const createCheckoutSessionFn = vi.fn(async () =>
        err('INTERNAL_ERROR', longMessage),
      );

      const redirectFn = createRedirectFn();
      const logError = vi.fn();

      await expect(
        runSubscribeAction(
          { plan: 'monthly', idempotencyKey: 'idem_1' },
          {
            createCheckoutSessionFn: createCheckoutSessionFn as never,
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
      expect(url.searchParams.get('error_code')).toBe('INTERNAL_ERROR');
      expect(url.searchParams.get('error_message')).toBe(`${'x'.repeat(200)}…`);

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
