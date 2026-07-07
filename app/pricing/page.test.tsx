// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES, toPricingRoute, toSignUpRedirectRoute } from '@/lib/routes';
import type { AuthGateway } from '@/src/application/ports/gateways';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';
import { FakeUseCase } from '@/src/application/test-helpers/fakes/fake-use-cases';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import {
  findAnchorByHref,
  findHeadingByText,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const { fixtureUser1Id } = vi.hoisted(() => ({
  fixtureUser1Id: crypto.randomUUID(),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ORIGINAL_ENV = snapshotProcessEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/addiction_boards_test';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
process.env.NEXT_PUBLIC_SKIP_CLERK ??= 'true';

type PricingPageModule = typeof import('@/app/pricing/page');
type PricingClientModule = typeof import('@/app/pricing/pricing-client');
type PricingPageInput = Parameters<PricingPageModule['default']>[0];
type PricingSearchParamsForTest = Awaited<PricingPageInput['searchParams']>;

let PricingView: PricingPageModule['PricingView'];
let getPricingBanner: PricingPageModule['getPricingBanner'];
let loadPricingData: PricingPageModule['loadPricingData'];
let runSubscribeAction: PricingPageModule['runSubscribeAction'];
let DeferredPricingView: PricingPageModule['DeferredPricingView'];
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
  DeferredPricingView = pageModule.DeferredPricingView;
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

const pricingTestUser = {
  id: fixtureUser1Id,
  email: 'user@example.com',
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
};

async function renderPricingPageWithEntitlementReason(
  reason: Exclude<CheckEntitlementOutput['reason'], null | undefined>,
) {
  const checkEntitlementUseCase = new FakeUseCase<
    CheckEntitlementInput,
    CheckEntitlementOutput
  >({
    isEntitled: false,
    reason,
  });
  const element = await PricingPage({
    searchParams: Promise.resolve({}),
    authNavFn: () => <div>AuthNav</div>,
    deps: {
      authGateway: new FakeAuthGateway(pricingTestUser),
      checkEntitlementUseCase,
    },
  });

  return renderToStaticMarkup(element);
}

async function renderPricingPageWithEntitlement(
  output: CheckEntitlementOutput,
) {
  const checkEntitlementUseCase = new FakeUseCase<
    CheckEntitlementInput,
    CheckEntitlementOutput
  >(output);
  const element = await PricingPage({
    searchParams: Promise.resolve({}),
    authNavFn: () => <div>AuthNav</div>,
    deps: {
      authGateway: new FakeAuthGateway(pricingTestUser),
      checkEntitlementUseCase,
    },
  });

  return renderToStaticMarkup(element);
}

async function renderAnonymousPricingPage(
  searchParams: PricingSearchParamsForTest = {},
) {
  const checkEntitlementUseCase = new FakeUseCase<
    CheckEntitlementInput,
    CheckEntitlementOutput
  >({
    isEntitled: false,
    reason: null,
  });
  const element = await PricingPage({
    searchParams: Promise.resolve(searchParams),
    authNavFn: () => <div>AuthNav</div>,
    deps: {
      authGateway: new FakeAuthGateway(null),
      checkEntitlementUseCase,
    },
  });

  return {
    html: renderToStaticMarkup(element),
    checkEntitlementUseCase,
  };
}

describe('app/pricing', () => {
  afterAll(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

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

  it('renders subscription_canceled banner copy when reason=subscription_canceled', async () => {
    expect(getPricingBanner({ reason: 'subscription_canceled' })).toMatchObject(
      {
        tone: 'info',
        message:
          'Your subscription is inactive. Choose a plan to restart access.',
      },
    );
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

  it('builds the portal error banner when portal=error', async () => {
    expect(getPricingBanner({ portal: 'error' })).toMatchObject({
      tone: 'error',
      message: "Couldn't open the billing portal. Please try again.",
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

  it('builds the trial-forward banner for first-timers', async () => {
    expect(
      getPricingBanner(
        { reason: 'subscription_required' },
        { subscriptionStatus: null },
      ),
    ).toMatchObject({
      tone: 'info',
      message: 'Start your free trial to access the app — no card required.',
    });
  });

  it('builds an ended-access banner for lapsed canceled subscriptions', async () => {
    expect(
      getPricingBanner(
        { reason: 'subscription_required' },
        { subscriptionStatus: 'canceled' },
      ),
    ).toMatchObject({
      tone: 'info',
      message: 'Your access ended — choose a plan to continue.',
    });
  });

  it('keeps the subscription-required banner for other prior statuses', async () => {
    expect(
      getPricingBanner(
        { reason: 'subscription_required' },
        { subscriptionStatus: 'paymentFailed' },
      ),
    ).toMatchObject({
      tone: 'info',
      message: 'Subscription required to access the app.',
    });
  });

  it('keeps the subscription-required banner when no trial context is provided', async () => {
    expect(getPricingBanner({ reason: 'subscription_required' })).toMatchObject(
      {
        tone: 'info',
        message: 'Subscription required to access the app.',
      },
    );
  });

  it('loadPricingData returns no banner reason when unauthenticated', async () => {
    const checkEntitlementUseCase = new FakeUseCase<
      CheckEntitlementInput,
      CheckEntitlementOutput
    >({
      isEntitled: true,
      reason: null,
    });

    await expect(
      loadPricingData({
        authGateway: new FakeAuthGateway(null),
        checkEntitlementUseCase,
      }),
    ).resolves.toEqual({
      isAuthenticated: false,
      isEntitled: false,
      reason: null,
      subscriptionStatus: null,
    });
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
  });

  it('loadPricingData returns isEntitled=true when entitled', async () => {
    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => ({
        id: fixtureUser1Id,
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
    ).resolves.toEqual({
      isAuthenticated: true,
      isEntitled: true,
      reason: null,
      subscriptionStatus: null,
    });
  });

  it('loadPricingData returns reason from entitlement check for non-entitled users', async () => {
    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => ({
        id: fixtureUser1Id,
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
      isAuthenticated: true,
      isEntitled: false,
      reason: 'manage_billing',
      subscriptionStatus: null,
    });
  });

  it('loadPricingData surfaces the subscription status for prior subscribers', async () => {
    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => pricingTestUser),
      requireUser: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({
        isEntitled: false,
        reason: 'subscription_required' as const,
        subscriptionStatus: 'canceled' as const,
        hasActiveSubscriptionPeriod: false,
        trialEndsAt: null,
      })),
    };

    await expect(
      loadPricingData({ authGateway, checkEntitlementUseCase }),
    ).resolves.toEqual({
      isAuthenticated: true,
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: 'canceled',
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

  it('runSubscribeAction redirects to sign-up with the selected plan return destination when unauthenticated', async () => {
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

    await expect(action()).rejects.toThrow(
      toSignUpRedirectRoute(toPricingRoute({ plan: 'annual' })),
    );
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
    expect(html).toContain('Start 7-day free trial');
  });

  it('does not render subscription-required copy for anonymous pricing visitors without search params', async () => {
    const { html, checkEntitlementUseCase } =
      await renderAnonymousPricingPage();

    expect(html).toContain('Pricing');
    expect(html).toContain('Start 7-day free trial');
    expect(html).not.toContain('Subscription required to access the app.');
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
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
    expect(html).toContain('Start 7-day free trial');
    expect(
      header?.querySelector('a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
  });

  it('renders trial CTAs through the deferred pricing path for anonymous visitors', async () => {
    const checkEntitlementUseCase = new FakeUseCase<
      CheckEntitlementInput,
      CheckEntitlementOutput
    >({
      isEntitled: false,
      reason: null,
    });

    const element = await DeferredPricingView({
      searchParams: Promise.resolve({ reason: 'subscription_required' }),
      deps: {
        authGateway: new FakeAuthGateway(null),
        checkEntitlementUseCase,
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      'Start your free trial to access the app — no card required.',
    );
    expect(html).toContain('Start 7-day free trial');
    expect(html).not.toContain('Subscription required to access the app.');
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
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

  it('does NOT pass manageBillingAction when reason=subscription_canceled', async () => {
    // subscription_canceled only arises for a canceled row whose period is
    // still active (determineNonEntitledReason); lapsed rows surface as
    // subscription_required instead.
    const html = await renderPricingPageWithEntitlement({
      isEntitled: false,
      reason: 'subscription_canceled',
      subscriptionStatus: 'canceled',
      hasActiveSubscriptionPeriod: true,
      trialEndsAt: null,
    });

    expect(html).toContain(
      'Your subscription is inactive. Choose a plan to restart access.',
    );
    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
    expect(html).not.toContain('Subscription needs attention');
    expect(html).not.toContain('Manage Billing');
  });

  it('continues to pass manageBillingAction when reason=manage_billing', async () => {
    const html = await renderPricingPageWithEntitlementReason('manage_billing');

    expect(html).toContain('Manage Billing');
    expect(html).not.toContain('Subscribe Monthly');
  });

  it('continues to pass manageBillingAction when reason=payment_processing', async () => {
    const html =
      await renderPricingPageWithEntitlementReason('payment_processing');

    expect(html).toContain('Manage Billing');
    expect(html).not.toContain('Subscribe Monthly');
  });

  it('renders trial-forward copy for logged-in first-timer redirects', async () => {
    const html = await renderPricingPageWithEntitlementReason(
      'subscription_required',
    );

    expect(html).toContain(
      'Start your free trial to access the app — no card required.',
    );
    expect(html).toContain('Start 7-day free trial');
    expect(html).not.toContain('Subscription required to access the app.');
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });

  it('uses authenticated entitlement state over stale return reason params', async () => {
    const checkEntitlementUseCase = new FakeUseCase<
      CheckEntitlementInput,
      CheckEntitlementOutput
    >({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: null,
      hasActiveSubscriptionPeriod: false,
      trialEndsAt: null,
    });
    const element = await PricingPage({
      searchParams: Promise.resolve({ reason: 'manage_billing' }),
      authNavFn: () => <div>AuthNav</div>,
      deps: {
        authGateway: new FakeAuthGateway(pricingTestUser),
        checkEntitlementUseCase,
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      'Start your free trial to access the app — no card required.',
    );
    expect(html).toContain('Start 7-day free trial');
    expect(html).not.toContain(
      'Subscription found. Manage billing to resolve payment issues.',
    );
    expect(html).not.toContain('Manage Billing');
  });

  it('renders trial CTAs and trial-forward copy for anonymous visitors', async () => {
    const { html } = await renderAnonymousPricingPage({
      reason: 'subscription_required',
    });

    expect(html).toContain(
      'Start your free trial to access the app — no card required.',
    );
    expect(html).toContain('Start 7-day free trial');
    expect(html).toContain('then $29/mo');
    expect(html).toContain('then $199/yr · no card required');
    expect(html).not.toContain('Subscription required to access the app.');
    expect(html).not.toContain('Subscribe Monthly');
    expect(html).not.toContain('Subscribe Annual');
  });

  it('renders anonymous trial CTAs as sign-up links carrying the selected plan', async () => {
    const { html } = await renderAnonymousPricingPage({
      reason: 'subscription_required',
    });
    const doc = parseHtml(html);
    const monthlyHref = toSignUpRedirectRoute(
      toPricingRoute({ plan: 'monthly' }),
    );
    const annualHref = toSignUpRedirectRoute(
      toPricingRoute({ plan: 'annual' }),
    );

    expect(findAnchorByHref(doc, monthlyHref)?.textContent).toContain(
      PRICING_DATA.monthly.trialCta,
    );
    expect(findAnchorByHref(doc, annualHref)?.textContent).toContain(
      PRICING_DATA.annual.trialCta,
    );
    expect(doc.querySelector('form[aria-label="Subscribe monthly plan"]')).toBe(
      null,
    );
    expect(doc.querySelector('form[aria-label="Subscribe annual plan"]')).toBe(
      null,
    );
  });

  it('renders anonymous standard subscribe links and annual selection when trial copy is disabled', () => {
    const html = renderToStaticMarkup(
      <PricingView
        isAuthenticated={false}
        isEntitled={false}
        banner={null}
        selectedPlan="annual"
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = parseHtml(html);
    const monthlyHref = toSignUpRedirectRoute(
      toPricingRoute({ plan: 'monthly' }),
    );
    const annualHref = toSignUpRedirectRoute(
      toPricingRoute({ plan: 'annual' }),
    );
    const annualCard = findHeadingByText(doc, PRICING_DATA.annual.name, {
      level: 3,
    })?.closest('[data-slot="card"]');

    expect(findAnchorByHref(doc, monthlyHref)?.textContent).toContain(
      'Subscribe Monthly',
    );
    expect(findAnchorByHref(doc, annualHref)?.textContent).toContain(
      'Subscribe Annual',
    );
    expect(annualCard?.getAttribute('aria-current')).toBe('true');
    expect(annualCard?.textContent).toContain('Selected plan');
    expect(html).not.toContain(PRICING_DATA.monthly.postTrialNote);
    expect(html).not.toContain(PRICING_DATA.annual.postTrialNote);
  });

  it('renders trial CTAs for signed-in first-time users', async () => {
    const html = await renderPricingPageWithEntitlement({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: null,
      hasActiveSubscriptionPeriod: false,
      trialEndsAt: null,
    });

    expect(html).toContain(
      'Start your free trial to access the app — no card required.',
    );
    expect(html).toContain('Start 7-day free trial');
    expect(html).not.toContain('Subscribe Monthly');
  });

  it('keeps signed-in first-time trial CTAs as checkout submit actions', async () => {
    const html = await renderPricingPageWithEntitlement({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: null,
      hasActiveSubscriptionPeriod: false,
      trialEndsAt: null,
    });
    const doc = parseHtml(html);

    expect(
      findAnchorByHref(
        doc,
        toSignUpRedirectRoute(toPricingRoute({ plan: 'monthly' })),
      ),
    ).toBeNull();
    expect(
      doc.querySelector('form[aria-label="Subscribe monthly plan"]'),
    ).not.toBeNull();
    expect(
      doc.querySelector('form[aria-label="Subscribe annual plan"]'),
    ).not.toBeNull();
  });

  it('marks the returned plan from the pricing query string', async () => {
    const checkEntitlementUseCase = new FakeUseCase<
      CheckEntitlementInput,
      CheckEntitlementOutput
    >({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: null,
      hasActiveSubscriptionPeriod: false,
      trialEndsAt: null,
    });
    const element = await PricingPage({
      searchParams: Promise.resolve({ plan: 'monthly' }),
      authNavFn: () => <div>AuthNav</div>,
      deps: {
        authGateway: new FakeAuthGateway(pricingTestUser),
        checkEntitlementUseCase,
      },
    });
    const doc = parseHtml(renderToStaticMarkup(element));
    const monthlyCard = findHeadingByText(doc, PRICING_DATA.monthly.name, {
      level: 3,
    })?.closest('[data-slot="card"]');
    const annualCard = findHeadingByText(doc, PRICING_DATA.annual.name, {
      level: 3,
    })?.closest('[data-slot="card"]');

    expect(monthlyCard?.getAttribute('aria-current')).toBe('true');
    expect(monthlyCard?.textContent).toContain('Selected plan');
    expect(annualCard?.getAttribute('aria-current')).toBeNull();
  });

  it('renders anonymous manage-billing recovery as a sign-up link carrying its return destination', async () => {
    const { html } = await renderAnonymousPricingPage({
      reason: 'manage_billing',
    });
    const doc = parseHtml(html);
    const manageBillingHref = toSignUpRedirectRoute(
      toPricingRoute({ reason: 'manage_billing' }),
    );
    const manageBillingLink = findAnchorByHref(doc, manageBillingHref);
    const bareSignUpManageBillingLinks = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>(`a[href="${ROUTES.SIGN_UP}"]`),
    ).filter((anchor) => anchor.textContent?.includes('Manage Billing'));

    expect(manageBillingLink?.textContent).toContain('Manage Billing');
    expect(doc.querySelector('form button[type="submit"]')).toBeNull();
    expect(bareSignUpManageBillingLinks).toHaveLength(0);
  });

  it('renders ended-access copy and standard CTAs for lapsed subscriptions', async () => {
    const html = await renderPricingPageWithEntitlement({
      isEntitled: false,
      reason: 'subscription_required',
      subscriptionStatus: 'canceled',
      hasActiveSubscriptionPeriod: false,
      trialEndsAt: null,
    });

    expect(html).toContain('Your access ended — choose a plan to continue.');
    expect(html).toContain('Subscribe Monthly');
    expect(html).toContain('Subscribe Annual');
    expect(html).not.toContain('Start 7-day free trial');
    expect(html).not.toContain('Your free trial ended');
  });

  it.each([
    [
      { reason: 'manage_billing' },
      'Subscription found. Manage billing to resolve payment issues.',
      'Manage Billing',
    ],
    [
      { reason: 'subscription_canceled' },
      'Your subscription is inactive. Choose a plan to restart access.',
      'Start 7-day free trial',
    ],
    [
      { reason: 'payment_processing' },
      'Payment processing. It may take a moment for access to activate.',
      'Manage Billing',
    ],
    [{ checkout: 'cancel' }, 'Checkout canceled.', 'Start 7-day free trial'],
    [
      { checkout: 'error' },
      'Checkout failed. Please try again.',
      'Start 7-day free trial',
    ],
    [
      { checkout: 'rate_limited' },
      'Too many checkout attempts. Please wait and try again.',
      'Start 7-day free trial',
    ],
  ] satisfies Array<
    [
      PricingSearchParamsForTest,
      expectedMessage: string,
      expectedAction: string,
    ]
  >)('preserves banner rendering for pricing query params %#', async (searchParams, expectedMessage, expectedAction) => {
    const { html } = await renderAnonymousPricingPage(searchParams);

    expect(html).toContain(expectedMessage);
    expect(html).toContain(expectedAction);
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
