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
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';
import { FakeUseCase } from '@/src/application/test-helpers/fakes/fake-use-cases';
import type {
  CheckEntitlementInput,
  CheckEntitlementOutput,
} from '@/src/application/use-cases/check-entitlement';
import {
  findAnchorByHref,
  findElementByText,
  findHeadingByText,
  parseHtml,
} from '@/tests/shared/dom-helpers';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const fixtureUser1Id = crypto.randomUUID();

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
    expect(html).toContain('Subscribe monthly');
    expect(html).toContain('Subscribe annual');
    expect(html).not.toContain('Subscription needs attention');
    expect(html).not.toContain('Manage billing');
  });

  it('continues to pass manageBillingAction when reason=manage_billing', async () => {
    const html = await renderPricingPageWithEntitlementReason('manage_billing');

    expect(html).toContain('Manage billing');
    expect(html).not.toContain('Subscribe monthly');
  });

  it('continues to pass manageBillingAction when reason=payment_processing', async () => {
    const html =
      await renderPricingPageWithEntitlementReason('payment_processing');

    expect(html).toContain('Manage billing');
    expect(html).not.toContain('Subscribe monthly');
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
    expect(html).not.toContain('Subscribe monthly');
    expect(html).not.toContain('Subscribe annual');
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
    expect(html).not.toContain('Manage billing');
  });

  it('renders trial CTAs and trial-forward copy for anonymous visitors', async () => {
    const { html } = await renderAnonymousPricingPage({
      reason: 'subscription_required',
    });
    const doc = parseHtml(html);

    expect(
      findElementByText(
        doc,
        'span',
        'Start your free trial to access the app — no card required.',
      ),
    ).not.toBeNull();
    // Anonymous CTAs render as sign-up anchors (Button asChild → Link).
    expect(
      findElementByText(doc, 'a', 'Start 7-day free trial'),
    ).not.toBeNull();
    expect(doc.querySelector('dl')).toBeNull();
    expect(html).not.toContain('Subscription required to access the app.');
    expect(html).not.toContain('Subscribe monthly');
    expect(html).not.toContain('Subscribe annual');
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
      'Subscribe monthly',
    );
    expect(findAnchorByHref(doc, annualHref)?.textContent).toContain(
      'Subscribe annual',
    );
    expect(annualCard?.getAttribute('aria-current')).toBe('true');
    expect(annualCard?.textContent).toContain('Selected plan');
    expect(doc.querySelector('dl')).toBeNull();
    expect(doc.querySelector('dl')).toBeNull();
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
    expect(html).not.toContain('Subscribe monthly');
  });

  it('renders signed-in trial CTAs as consent-dialog triggers', async () => {
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
    expect(doc.querySelector('button[aria-haspopup="dialog"]')).not.toBeNull();
    expect(doc.querySelectorAll('button[aria-haspopup="dialog"]')).toHaveLength(
      2,
    );
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

  it('ignores an invalid plan query without selecting or opening an offer', async () => {
    const view = await DeferredPricingView({
      searchParams: Promise.resolve({ plan: 'lifetime' }),
      deps: {
        authGateway: new FakeAuthGateway(pricingTestUser),
        checkEntitlementUseCase: new FakeUseCase<
          CheckEntitlementInput,
          CheckEntitlementOutput
        >({
          isEntitled: false,
          reason: 'subscription_required',
          subscriptionStatus: null,
          hasActiveSubscriptionPeriod: false,
          trialEndsAt: null,
        }),
      },
    });

    expect(view.props.selectedPlan).toBeNull();
    const doc = parseHtml(renderToStaticMarkup(view));
    expect(doc.querySelector('[aria-current="true"]')).toBeNull();
    expect(doc.querySelector('button[data-state="open"]')).toBeNull();
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
    ).filter((anchor) => anchor.textContent?.includes('Manage billing'));

    expect(manageBillingLink?.textContent).toContain('Manage billing');
    expect(doc.querySelector('form button[type="submit"]')).toBeNull();
    expect(bareSignUpManageBillingLinks).toHaveLength(0);
  });

  it('renders anonymous payment-processing recovery as a sign-up link carrying its return destination', async () => {
    const { html } = await renderAnonymousPricingPage({
      reason: 'payment_processing',
    });
    const doc = parseHtml(html);
    const paymentProcessingHref = toSignUpRedirectRoute(
      toPricingRoute({ reason: 'payment_processing' }),
    );
    const manageBillingHref = toSignUpRedirectRoute(
      toPricingRoute({ reason: 'manage_billing' }),
    );
    const paymentProcessingLink = findAnchorByHref(doc, paymentProcessingHref);
    const staleManageBillingLink = findAnchorByHref(doc, manageBillingHref);

    expect(paymentProcessingLink?.textContent).toContain('Manage billing');
    expect(staleManageBillingLink).toBeNull();
    expect(doc.querySelector('form button[type="submit"]')).toBeNull();
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
    expect(html).toContain('Subscribe monthly');
    expect(html).toContain('Subscribe annual');
    expect(html).not.toContain('Start 7-day free trial');
    expect(html).not.toContain('Your free trial ended');
  });

  it.each([
    [
      { reason: 'manage_billing' },
      'Subscription found. Manage billing to resolve payment issues.',
      'Manage billing',
    ],
    [
      { reason: 'subscription_canceled' },
      'Your subscription is inactive. Choose a plan to restart access.',
      'Start 7-day free trial',
    ],
    [
      { reason: 'payment_processing' },
      'Payment processing. It may take a moment for access to activate.',
      'Manage billing',
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
  >)(
    'preserves banner rendering for pricing query params %#',
    async (searchParams, expectedMessage, expectedAction) => {
      const { html } = await renderAnonymousPricingPage(searchParams);

      expect(html).toContain(expectedMessage);
      expect(html).toContain(expectedAction);
    },
  );

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

    expect(html).toContain('Manage billing');
    expect(html).not.toContain('Subscribe monthly');
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
  });
});
