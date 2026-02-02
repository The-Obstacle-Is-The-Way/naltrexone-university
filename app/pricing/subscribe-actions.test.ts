import { describe, expect, it, vi } from 'vitest';

describe('app/pricing/subscribe-actions', () => {
  it('subscribes monthly via runSubscribeAction with injected deps', async () => {
    const { subscribeMonthlyAction } = await import('./subscribe-actions');

    const createCheckoutSessionFn = vi.fn(
      async ({ plan }: { plan: string }) =>
        ({ ok: true, data: { url: `https://checkout/${plan}` } }) as const,
    );

    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      subscribeMonthlyAction({
        createCheckoutSessionFn,
        redirectFn: redirectFn as never,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/monthly',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'monthly' });
  });

  it('subscribes annual via runSubscribeAction with injected deps', async () => {
    const { subscribeAnnualAction } = await import('./subscribe-actions');

    const createCheckoutSessionFn = vi.fn(
      async ({ plan }: { plan: string }) =>
        ({ ok: true, data: { url: `https://checkout/${plan}` } }) as const,
    );

    const redirectFn = vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      subscribeAnnualAction({
        createCheckoutSessionFn,
        redirectFn: redirectFn as never,
      }),
    ).rejects.toMatchObject({
      message: 'redirect:https://checkout/annual',
    });

    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'annual' });
  });
});
