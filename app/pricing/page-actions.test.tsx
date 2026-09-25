// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { toPricingRoute, toSignUpRedirectRoute } from '@/lib/routes';
import type { AuthGateway } from '@/src/application/ports/gateways';
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

let getPricingBanner: PricingPageModule['getPricingBanner'];
let loadPricingData: PricingPageModule['loadPricingData'];
let runSubscribeAction: PricingPageModule['runSubscribeAction'];

type CreateCheckoutSessionFn = Parameters<
  typeof import('@/app/pricing/page').runSubscribeAction
>[1]['createCheckoutSessionFn'];

beforeAll(async () => {
  const pageModule = await import('@/app/pricing/page');
  getPricingBanner = pageModule.getPricingBanner;
  loadPricingData = pageModule.loadPricingData;
  runSubscribeAction = pageModule.runSubscribeAction;
});

const pricingTestUser = {
  id: fixtureUser1Id,
  email: 'user@example.com',
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
};

describe('app/pricing', () => {
  afterAll(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
});
