// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';
import type { AuthGateway } from '@/src/application/ports/gateways';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';
import { FakeUseCase } from '@/src/application/test-helpers/fakes/fake-use-cases';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type PricingPageModule = typeof import('@/app/pricing/page');
type PricingClientModule = typeof import('@/app/pricing/pricing-client');

let PricingView: PricingPageModule['PricingView'];
let getPricingBanner: PricingPageModule['getPricingBanner'];
let loadPricingData: PricingPageModule['loadPricingData'];
let runSubscribeAction: PricingPageModule['runSubscribeAction'];
let PricingPage: PricingPageModule['default'];
let SubscribeButton: PricingClientModule['SubscribeButton'];

type CreateCheckoutSessionFn = Parameters<
  typeof import('@/app/pricing/page').runSubscribeAction
>[1]['createCheckoutSessionFn'];

beforeAll(async () => {
  const [pageModule, pricingClientModule] = await Promise.all([
    import('@/app/pricing/page'),
    import('@/app/pricing/pricing-client'),
  ]);
  PricingView = pageModule.PricingView;
  getPricingBanner = pageModule.getPricingBanner;
  loadPricingData = pageModule.loadPricingData;
  runSubscribeAction = pageModule.runSubscribeAction;
  PricingPage = pageModule.default;
  SubscribeButton = pricingClientModule.SubscribeButton;
});

function createTrackedThenable<T>() {
  const thenSpy = vi.fn();
  let resolveValue: ((value: T) => void) | undefined;
  const source = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  const thenFn = <TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ) => {
    thenSpy();
    return source.then(onFulfilled, onRejected);
  };

  const proxy = new Proxy(
    {},
    {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return thenFn;
        }

        return Reflect.get(target, prop, receiver);
      },
    },
  );

  return {
    thenable: proxy as PromiseLike<T>,
    thenSpy,
    resolve: (value: T) => {
      resolveValue?.(value);
    },
  };
}

describe('app/pricing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders subscribe actions when user is not subscribed', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/"]');

    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
    expect(backLink?.textContent?.trim()).toBe('Back to Home');
    expect(doc.querySelector('[data-testid="pricing-root"]')).not.toBeNull();
    expect(doc.querySelector('header')).not.toBeNull();
  });

  it('shows an error banner when checkout=error', async () => {
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

  it('renders pricing plan headings', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = Array.from(doc.querySelectorAll('h3')).map((heading) =>
      heading.textContent?.trim(),
    );

    expect(headings).toContain('Pro Monthly');
    expect(headings).toContain('Pro Annual');
  });

  it('relies on the outer marketing layout for viewport min-height', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.querySelector('[data-testid="pricing-root"]');
    const classes = root?.getAttribute('class') ?? '';

    expect(classes).toContain('bg-background');
    expect(classes).toContain('py-16');
    expect(classes).not.toContain('min-h-screen');
  });

  it('renders shared pricing values', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain(PRICING_DATA.monthly.price);
    expect(html).toContain(PRICING_DATA.annual.price);
    expect(html).toContain(PRICING_DATA.annual.savings);
  });

  it('uses a semantic heading hierarchy for pricing sections', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h1 = doc.querySelector('h1');
    const h2 = doc.querySelector('h2');
    const h3 = doc.querySelector('h3');

    expect(h1?.textContent?.trim()).toBe('Pricing');
    expect(h1?.getAttribute('class') ?? '').toContain('font-heading');
    expect(h2?.textContent?.trim()).toBe('Plans');
    expect(h3).not.toBeNull();
  });

  it('uses the shared Button primitive for manage-billing form submit actions', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'error',
          message: 'Checkout failed. Please try again.',
        }}
        manageBillingAction={async () => undefined}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const submitButtons = Array.from(
      doc.querySelectorAll('form button[type="submit"]'),
    );
    const nonPrimitiveButtons = submitButtons.filter(
      (button) => button.getAttribute('data-slot') !== 'button',
    );

    expect(submitButtons.length).toBeGreaterThan(0);
    expect(nonPrimitiveButtons).toHaveLength(0);
  });

  it('uses the shared Button primitive for subscribe form submit actions', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const submitButtons = Array.from(
      doc.querySelectorAll('form button[type="submit"]'),
    );
    const nonPrimitiveButtons = submitButtons.filter(
      (button) => button.getAttribute('data-slot') !== 'button',
    );

    expect(submitButtons.length).toBeGreaterThan(0);
    expect(nonPrimitiveButtons).toHaveLength(0);
  });

  it('shows a cancel banner when checkout=cancel', async () => {
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

  it('renders the subscribed state content inside the shared Card primitive', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector(
      'div.text-lg.font-semibold.text-foreground',
    );
    const subscribedCard = heading?.closest('[data-slot="card"]');

    expect(heading?.textContent).toContain("You're already subscribed");
    expect(subscribedCard).not.toBeNull();
  });

  it('renders the billing-attention state inside the shared Card primitive', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        manageBillingAction={async (_formData: FormData) => undefined}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector(
      'div.text-lg.font-semibold.text-foreground',
    );
    const billingCard = heading?.closest('[data-slot="card"]');

    expect(heading?.textContent).toContain('Subscription needs attention');
    expect(billingCard).not.toBeNull();
  });

  it('renders both plan containers with the shared Card primitive', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const monthlyHeading = doc.querySelector('h3');
    const annualHeading = doc.querySelectorAll('h3')[1] ?? null;

    expect(monthlyHeading?.closest('[data-slot="card"]')).not.toBeNull();
    expect(annualHeading?.closest('[data-slot="card"]')).not.toBeNull();
  });

  it('builds the subscription-required banner when reason=subscription_required', async () => {
    expect(getPricingBanner({ reason: 'subscription_required' })).toMatchObject(
      {
        tone: 'info',
        message: 'Subscription required to access the app.',
      },
    );
  });

  it('builds the manage-billing banner when reason=manage_billing', async () => {
    expect(getPricingBanner({ reason: 'manage_billing' })).toMatchObject({
      tone: 'info',
      message: 'Subscription found. Manage billing to resolve payment issues.',
    });
  });

  it('builds the manage-billing banner when reason is a repeated query param', async () => {
    expect(
      getPricingBanner({
        reason: ['manage_billing', 'subscription_required'],
      }),
    ).toMatchObject({
      tone: 'info',
      message: 'Subscription found. Manage billing to resolve payment issues.',
    });
  });

  it('builds the payment-processing banner when reason=payment_processing', async () => {
    expect(getPricingBanner({ reason: 'payment_processing' })).toMatchObject({
      tone: 'info',
      message:
        'Payment processing. It may take a moment for access to activate.',
    });
  });

  it('builds the payment-processing banner when reason is a repeated query param', async () => {
    expect(getPricingBanner({ reason: ['payment_processing'] })).toMatchObject({
      tone: 'info',
      message:
        'Payment processing. It may take a moment for access to activate.',
    });
  });

  it('builds the checkout error banner when checkout=error', async () => {
    expect(getPricingBanner({ checkout: 'error' })).toMatchObject({
      tone: 'error',
      message: 'Checkout failed. Please try again.',
    });
  });

  it('builds the checkout error banner when checkout is a repeated query param', async () => {
    expect(getPricingBanner({ checkout: ['error', 'cancel'] })).toMatchObject({
      tone: 'error',
      message: 'Checkout failed. Please try again.',
    });
  });

  it('builds the checkout canceled banner when checkout=cancel', async () => {
    expect(getPricingBanner({ checkout: 'cancel' })).toMatchObject({
      tone: 'info',
      message: 'Checkout canceled.',
    });
  });

  it('builds the rate-limited banner when checkout=rate_limited', async () => {
    expect(getPricingBanner({ checkout: 'rate_limited' })).toMatchObject({
      tone: 'info',
      message: 'Too many checkout attempts. Please wait and try again.',
    });
  });

  it('builds the rate-limited banner when checkout is a repeated query param', async () => {
    expect(getPricingBanner({ checkout: ['rate_limited'] })).toMatchObject({
      tone: 'info',
      message: 'Too many checkout attempts. Please wait and try again.',
    });
  });

  it('returns null when no banner parameters are set', async () => {
    expect(getPricingBanner({})).toBe(null);
  });

  it('loadPricingData returns isEntitled=false when unauthenticated', async () => {
    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => null),
      requireUser: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: true, reason: null })),
    };

    await expect(
      loadPricingData({ authGateway, checkEntitlementUseCase }),
    ).resolves.toEqual({
      isEntitled: false,
      reason: 'subscription_required',
    });
    expect(checkEntitlementUseCase.execute).not.toHaveBeenCalled();
  });

  it('loadPricingData returns isEntitled=true when entitled', async () => {
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
      execute: vi.fn(async () => ({ isEntitled: true, reason: null })),
    };

    await expect(
      loadPricingData({ authGateway, checkEntitlementUseCase }),
    ).resolves.toEqual({ isEntitled: true, reason: null });
  });

  it('loadPricingData returns reason from entitlement check for non-entitled users', async () => {
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
      execute: vi.fn(async () => ({
        isEntitled: false,
        reason: 'manage_billing' as const,
      })),
    };

    await expect(
      loadPricingData({ authGateway, checkEntitlementUseCase }),
    ).resolves.toEqual({
      isEntitled: false,
      reason: 'manage_billing',
    });
  });

  it('runSubscribeAction redirects to checkout url on success', async () => {
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

  it('runSubscribeAction redirects to /pricing?checkout=rate_limited when rate limited', async () => {
    const createCheckoutSessionFn = vi.fn<CreateCheckoutSessionFn>(
      async () => ({
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
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

    await expect(action()).rejects.toThrow('/pricing?checkout=rate_limited');
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('runSubscribeAction redirects to /pricing?checkout=error for other errors', async () => {
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
      '/pricing?checkout=error&plan=monthly',
    );
    expect(createCheckoutSessionFn).toHaveBeenCalledWith({
      plan: 'monthly',
      idempotencyKey: undefined,
    });
  });

  it('renders a manage-billing action when provided', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={{
          tone: 'info',
          message:
            'Subscription found. Manage billing to resolve payment issues.',
        }}
        manageBillingAction={async (_formData: FormData) => undefined}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );

    expect(html).toContain('Manage Billing');
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });

  it('renders dismiss link when banner is present', async () => {
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const dismissLink = doc.querySelector('a[aria-label="Dismiss"]');
    const dismissClasses = dismissLink?.getAttribute('class') ?? '';

    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toContain('×');
    expect(html).toContain('href="/pricing"');
    expect(dismissClasses).toContain('text-muted-foreground');
    expect(dismissClasses).toContain('transition-colors');
    expect(dismissClasses).toContain('hover:text-foreground');
    expect(dismissClasses).not.toContain('text-current');
    expect(dismissClasses).not.toContain('hover:opacity-70');
  });

  it('SubscribeButton renders children when not pending', async () => {
    const html = renderToStaticMarkup(
      <SubscribeButton>Subscribe Monthly</SubscribeButton>,
    );

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('Subscribe Monthly');
    expect(html).not.toContain('Processing...');
  });

  it('does not render dismiss link when banner is null', async () => {
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
    const element = await PricingPage({
      searchParams: Promise.resolve({}),
      authNavFn: () => <div>AuthNav</div>,
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

  it('renders injected pricing state with the static auth fallback when authNavFn is omitted', async () => {
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const header = doc.querySelector('header');

    expect(html).toContain('Pricing');
    expect(html).toContain('Subscribe Monthly');
    expect(
      header?.querySelector('a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
  });

  it('renders a neutral pricing skeleton fallback without awaiting search params', async () => {
    const { thenable: searchParams } =
      createTrackedThenable<Record<string, never>>();

    const pagePromise = PricingPage({
      searchParams: searchParams as unknown as Promise<Record<string, never>>,
    });

    const element = await pagePromise;
    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pricingFallback = doc.querySelector(
      '[data-testid="pricing-loading-root"]',
    );

    expect(html).toContain('Pricing');
    expect(html).toContain(PRICING_DATA.monthly.name);
    expect(html).toContain(PRICING_DATA.annual.name);
    expect(pricingFallback).not.toBeNull();
    expect(pricingFallback?.getAttribute('aria-busy')).toBe('true');
    expect(pricingFallback?.querySelector('form')).toBeNull();
    expect(pricingFallback?.querySelector('button[type="submit"]')).toBeNull();
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
    expect(html).not.toContain('Manage Billing');
    expect(
      doc.querySelector('header a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
  });

  it('renders exactly one main landmark through the full pricing page', async () => {
    const element = await PricingPage({
      searchParams: Promise.resolve({}),
      authNavFn: () => <div>AuthNav</div>,
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mainLandmarks = doc.querySelectorAll('main');

    expect(mainLandmarks).toHaveLength(1);
    expect(mainLandmarks[0]?.getAttribute('id')).toBe('main-content');
    expect(mainLandmarks[0]?.getAttribute('tabindex')).toBe('-1');
  });

  it('renders manage billing guidance when entitlement reason is manage_billing', async () => {
    const element = await PricingPage({
      searchParams: Promise.resolve({}),
      authNavFn: () => <div>AuthNav</div>,
      deps: {
        authGateway: {
          getCurrentUser: async () => ({
            id: 'user_1',
            email: 'user@example.com',
            createdAt: new Date('2026-02-01T00:00:00Z'),
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          }),
          requireUser: async () => {
            throw new Error('not used');
          },
        },
        checkEntitlementUseCase: {
          execute: async () => ({
            isEntitled: false,
            reason: 'manage_billing' as const,
          }),
        },
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Manage Billing');
    expect(html).not.toContain('Subscribe Monthly');
  });

  it('renders the manage billing action when reason is a repeated query param', async () => {
    const checkEntitlementUseCase = new FakeUseCase<
      CheckEntitlementInput,
      CheckEntitlementOutput
    >({
      isEntitled: false,
      reason: 'subscription_required',
    });
    const element = await PricingPage({
      searchParams: Promise.resolve({
        reason: ['manage_billing', 'subscription_required'],
      }),
      authNavFn: () => <div>AuthNav</div>,
      deps: {
        authGateway: new FakeAuthGateway(null),
        checkEntitlementUseCase,
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Manage Billing');
    expect(html).not.toContain('Subscribe Monthly');
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
  });
});
