// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/pricing', () => {
  it('renders subscribe actions when user is not subscribed', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
  });

  it('shows an error banner when checkout=error', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'error',
          message: 'Checkout failed. Please try again.',
        }}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Checkout failed. Please try again.');
  });

  it('shows a cancel banner when checkout=cancel', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'info',
          message: 'Checkout canceled.',
        }}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Checkout canceled.');
  });

  it('hides subscribe actions when user is already subscribed', async () => {
    const { PricingView } = await import('./page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('already subscribed');
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });

  it('builds the subscription-required banner when reason=subscription_required', async () => {
    const { getPricingBanner } = await import('./page');

    expect(getPricingBanner({ reason: 'subscription_required' })).toMatchObject(
      {
        tone: 'info',
        message: 'Subscription required to access the app.',
      },
    );
  });

  it('builds the checkout error banner when checkout=error', async () => {
    const { getPricingBanner } = await import('./page');

    expect(getPricingBanner({ checkout: 'error' })).toMatchObject({
      tone: 'error',
      message: 'Checkout failed. Please try again.',
    });
  });

  it('builds the checkout canceled banner when checkout=cancel', async () => {
    const { getPricingBanner } = await import('./page');

    expect(getPricingBanner({ checkout: 'cancel' })).toMatchObject({
      tone: 'info',
      message: 'Checkout canceled.',
    });
  });

  it('returns null when no banner parameters are set', async () => {
    const { getPricingBanner } = await import('./page');

    expect(getPricingBanner({})).toBe(null);
  });

  it('loadPricingData returns isEntitled=false when unauthenticated', async () => {
    const { loadPricingData } = await import('./page');

    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => null),
      requireUser: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: true })),
    };

    await expect(
      loadPricingData({ authGateway, checkEntitlementUseCase }),
    ).resolves.toEqual({ isEntitled: false });
    expect(checkEntitlementUseCase.execute).not.toHaveBeenCalled();
  });

  it('loadPricingData returns isEntitled=true when entitled', async () => {
    const { loadPricingData } = await import('./page');

    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => ({
        id: 'user_1',
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      })),
      requireUser: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: true })),
    };

    await expect(
      loadPricingData({ authGateway, checkEntitlementUseCase }),
    ).resolves.toEqual({ isEntitled: true });
  });

  it('createSubscribeAction redirects to checkout url on success', async () => {
    const { createSubscribeAction } = await import('./page');

    const createCheckoutSessionFn = vi.fn(async () => ({
      ok: true,
      data: { url: 'https://stripe.test/checkout' },
    }));

    const redirectFn = vi.fn((url: string) => {
      throw new Error(url);
    }) as unknown as (url: string) => never;

    const action = createSubscribeAction({
      plan: 'monthly',
      createCheckoutSessionFn: createCheckoutSessionFn as never,
      redirectFn,
    });

    await expect(action()).rejects.toThrow('https://stripe.test/checkout');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'monthly' });
  });

  it('createSubscribeAction redirects to /sign-up when unauthenticated', async () => {
    const { createSubscribeAction } = await import('./page');

    const createCheckoutSessionFn = vi.fn(async () => ({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'No session' },
    }));

    const redirectFn = vi.fn((url: string) => {
      throw new Error(url);
    }) as unknown as (url: string) => never;

    const action = createSubscribeAction({
      plan: 'annual',
      createCheckoutSessionFn: createCheckoutSessionFn as never,
      redirectFn,
    });

    await expect(action()).rejects.toThrow('/sign-up');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'annual' });
  });

  it('createSubscribeAction redirects to /pricing?checkout=error for other errors', async () => {
    const { createSubscribeAction } = await import('./page');

    const createCheckoutSessionFn = vi.fn(async () => ({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    }));

    const redirectFn = vi.fn((url: string) => {
      throw new Error(url);
    }) as unknown as (url: string) => never;

    const action = createSubscribeAction({
      plan: 'monthly',
      createCheckoutSessionFn: createCheckoutSessionFn as never,
      redirectFn,
    });

    await expect(action()).rejects.toThrow('/pricing?checkout=error');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({ plan: 'monthly' });
  });
});
