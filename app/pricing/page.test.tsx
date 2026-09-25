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
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';
import { FakeUseCase } from '@/src/application/test-helpers/fakes/fake-use-cases';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

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
type PricingPageInput = Parameters<PricingPageModule['default']>[0];
type PricingSearchParamsForTest = Awaited<PricingPageInput['searchParams']>;

let PricingView: PricingPageModule['PricingView'];
let DeferredPricingView: PricingPageModule['DeferredPricingView'];
let PricingPage: PricingPageModule['default'];

beforeAll(async () => {
  const pageModule = await import('@/app/pricing/page');
  PricingView = pageModule.PricingView;
  DeferredPricingView = pageModule.DeferredPricingView;
  PricingPage = pageModule.default;
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

    expect(html).toContain('Subscribe monthly');
    expect(html).toContain('Subscribe annual');
    expect(backLink).toBeNull();
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

  it('uses the shared Button primitive for plan consent triggers', async () => {
    const html = renderToStaticMarkup(
      <PricingView
        isEntitled={false}
        banner={null}
        subscribeMonthlyAction={async () => undefined}
        subscribeAnnualAction={async () => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const triggerButtons = Array.from(
      doc.querySelectorAll('button[aria-haspopup="dialog"]'),
    );
    const nonPrimitiveButtons = triggerButtons.filter(
      (button) => button.getAttribute('data-variant') !== 'default',
    );

    expect(triggerButtons.length).toBeGreaterThan(0);
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
    expect(html).not.toContain('Subscribe monthly');
    expect(html).not.toContain('Subscribe annual');
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

    expect(html).toContain('Manage billing');
    expect(html).not.toContain('Subscribe monthly');
    expect(html).not.toContain('Subscribe annual');
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
    expect(html).not.toContain('Subscribe monthly');
    expect(html).not.toContain('Subscribe annual');
    expect(html).not.toContain('Manage billing');
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
});
