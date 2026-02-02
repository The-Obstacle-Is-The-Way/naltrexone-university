import { describe, expect, it, vi } from 'vitest';
import {
  subscribeAnnualAction,
  subscribeMonthlyAction,
} from '@/app/pricing/subscribe-actions';
import { err, ok } from '@/src/adapters/controllers/action-result';

describe('app/pricing/subscribe-actions', () => {
  it('subscribes monthly via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      subscribeMonthlyAction({
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'monthly' });
  });

  it('subscribes annual via runSubscribeAction with injected deps', async () => {
    const createCheckoutSessionFn = vi.fn(async ({ plan }: { plan: string }) =>
      ok({ url: `https://checkout/${plan}` }),
    );

    const redirectFn = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      subscribeAnnualAction({
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/annual',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'annual' });
  });

  it('redirects to sign-up when checkout session returns UNAUTHENTICATED', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('UNAUTHENTICATED', 'Not signed in'),
    );

    const redirectFn = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      subscribeMonthlyAction({
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/sign-up',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'monthly' });
  });

  it('redirects back to pricing when checkout session fails', async () => {
    const createCheckoutSessionFn = vi.fn(async () =>
      err('INTERNAL_ERROR', 'Boom'),
    );

    const redirectFn = vi.fn((url: string): never => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      subscribeMonthlyAction({
        createCheckoutSessionFn,
        redirectFn,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/pricing?checkout=error',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'monthly' });
  });
});
