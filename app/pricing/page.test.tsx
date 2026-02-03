// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/pricing', () => {
  type CreateCheckoutSessionFn = Parameters<
    typeof import('@/app/pricing/page').runSubscribeAction
  >[1]['createCheckoutSessionFn'];

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders subscribe actions when user is not subscribed', async () => {
    const { PricingView } = await import('@/app/pricing/page');

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
    const { PricingView } = await import('@/app/pricing/page');

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
    const { PricingView } = await import('@/app/pricing/page');

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
    const { PricingView } = await import('@/app/pricing/page');

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
    const { getPricingBanner } = await import('@/app/pricing/page');

    expect(getPricingBanner({ reason: 'subscription_required' })).toMatchObject(
      {
        tone: 'info',
        message: 'Subscription required to access the app.',
      },
    );
  });

  it('builds the manage-billing banner when reason=manage_billing', async () => {
    const { getPricingBanner } = await import('@/app/pricing/page');

    expect(getPricingBanner({ reason: 'manage_billing' })).toMatchObject({
      tone: 'info',
      message: 'Subscription found. Manage billing to resolve payment issues.',
    });
  });

  it('builds the payment-processing banner when reason=payment_processing', async () => {
    const { getPricingBanner } = await import('@/app/pricing/page');

    expect(getPricingBanner({ reason: 'payment_processing' })).toMatchObject({
      tone: 'info',
      message:
        'Payment processing. It may take a moment for access to activate.',
    });
  });

  it('builds the checkout error banner when checkout=error', async () => {
    const { getPricingBanner } = await import('@/app/pricing/page');

    expect(getPricingBanner({ checkout: 'error' })).toMatchObject({
      tone: 'error',
      message: 'Checkout failed. Please try again.',
    });
  });

  it('includes error code details in development for checkout=error', async () => {
    const { getPricingBanner } = await import('@/app/pricing/page');

    vi.stubEnv('NODE_ENV', 'development');

    expect(
      getPricingBanner({
        checkout: 'error',
        error_code: 'INTERNAL_ERROR',
        error_message: 'Boom',
      }),
    ).toMatchObject({
      tone: 'error',
      message: 'Checkout failed (INTERNAL_ERROR). Boom',
    });
  });

  it('builds the checkout canceled banner when checkout=cancel', async () => {
    const { getPricingBanner } = await import('@/app/pricing/page');

    expect(getPricingBanner({ checkout: 'cancel' })).toMatchObject({
      tone: 'info',
      message: 'Checkout canceled.',
    });
  });

  it('returns null when no banner parameters are set', async () => {
    const { getPricingBanner } = await import('@/app/pricing/page');

    expect(getPricingBanner({})).toBe(null);
  });

  it('loadPricingData returns isEntitled=false when unauthenticated', async () => {
    const { loadPricingData } = await import('@/app/pricing/page');

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
    const { loadPricingData } = await import('@/app/pricing/page');

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

  it('runSubscribeAction redirects to checkout url on success', async () => {
    const { runSubscribeAction } = await import('@/app/pricing/page');

    const createCheckoutSessionFn = vi.fn<CreateCheckoutSessionFn>(
      async () => ({
        ok: true,
        data: { url: 'https://stripe.test/checkout' },
      }),
    );

    const redirectFn = (url: string): never => {
      throw new Error(url);
    };

    const action = async () =>
      runSubscribeAction(
        { plan: 'monthly' },
        {
          createCheckoutSessionFn,
          redirectFn,
        },
      );

    await expect(action()).rejects.toThrow('https://stripe.test/checkout');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('runSubscribeAction redirects to /sign-up when unauthenticated', async () => {
    const { runSubscribeAction } = await import('@/app/pricing/page');

    const createCheckoutSessionFn = vi.fn<CreateCheckoutSessionFn>(
      async () => ({
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'No session' },
      }),
    );

    const redirectFn = (url: string): never => {
      throw new Error(url);
    };

    const action = async () =>
      runSubscribeAction(
        { plan: 'annual' },
        {
          createCheckoutSessionFn,
          redirectFn,
        },
      );

    await expect(action()).rejects.toThrow('/sign-up');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'annual',
      idempotencyKey: undefined,
    });
  });

  it('runSubscribeAction redirects to /pricing?reason=manage_billing when already subscribed', async () => {
    const { runSubscribeAction } = await import('@/app/pricing/page');

    const createCheckoutSessionFn = vi.fn<CreateCheckoutSessionFn>(
      async () => ({
        ok: false,
        error: { code: 'ALREADY_SUBSCRIBED', message: 'Already subscribed' },
      }),
    );

    const redirectFn = (url: string): never => {
      throw new Error(url);
    };

    const action = async () =>
      runSubscribeAction(
        { plan: 'monthly' },
        {
          createCheckoutSessionFn,
          redirectFn,
        },
      );

    await expect(action()).rejects.toThrow('/pricing?reason=manage_billing');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('runSubscribeAction redirects to /pricing?checkout=error for other errors', async () => {
    const { runSubscribeAction } = await import('@/app/pricing/page');

    const createCheckoutSessionFn = vi.fn<CreateCheckoutSessionFn>(
      async () => ({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
      }),
    );

    const redirectFn = (url: string): never => {
      throw new Error(url);
    };

    const action = async () =>
      runSubscribeAction(
        { plan: 'monthly' },
        {
          createCheckoutSessionFn,
          redirectFn,
        },
      );

    await expect(action()).rejects.toThrow(
      '/pricing?checkout=error&plan=monthly&error_code=INTERNAL_ERROR',
    );
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('renders a manage-billing action when provided', async () => {
    const { PricingView } = await import('@/app/pricing/page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'info',
          message:
            'Subscription found. Manage billing to resolve payment issues.',
        }}
        manageBillingAction={async () => undefined}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Manage Billing');
  });

  it('renders dismiss link when banner is present', async () => {
    const { PricingView } = await import('@/app/pricing/page');

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

    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toContain('×');
    expect(html).toContain('href="/pricing"');
  });

  it('SubscribeButton renders children when not pending', async () => {
    const { SubscribeButton } = await import('@/app/pricing/pricing-client');

    const html = renderToStaticMarkup(
      <SubscribeButton>Subscribe Monthly</SubscribeButton>,
    );

    expect(html).toContain('Subscribe Monthly');
    expect(html).not.toContain('Processing...');
  });

  it('does not render dismiss link when banner is null', async () => {
    const { PricingView } = await import('@/app/pricing/page');

    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).not.toContain('aria-label="Dismiss"');
  });

  it('renders PricingPage when deps are injected', async () => {
    const PricingPage = (await import('@/app/pricing/page')).default;

    const element = await PricingPage({
      searchParams: Promise.resolve({}),
      deps: {
        authGateway: {
          getCurrentUser: async () => null,
          requireUser: async () => {
            throw new Error('not used');
          },
        },
        checkEntitlementUseCase: {
          execute: async () => ({ isEntitled: false }),
        },
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Pricing');
    expect(html).toContain('Subscribe Monthly');
  });
});
