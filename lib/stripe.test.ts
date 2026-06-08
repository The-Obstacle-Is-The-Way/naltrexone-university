import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { STRIPE_API_VERSION } from './stripe-api-version';

const ORIGINAL_ENV = snapshotProcessEnv();

function setSharedTestEnv() {
  process.env.DATABASE_URL =
    'postgresql://user:pass@localhost:5432/addiction_boards_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY = 'price_dummy_monthly';
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL = 'price_dummy_annual';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
}

type StripeInstance = {
  apiKey: string;
  options: {
    apiVersion: string;
    typescript: boolean;
  };
};

function createStripeConstructorMock() {
  return vi.fn(function StripeMock(
    this: StripeInstance,
    apiKey: string,
    options: StripeInstance['options'],
  ) {
    this.apiKey = apiKey;
    this.options = options;
  });
}

describe('STRIPE_API_VERSION', () => {
  it('is a non-empty string with a dated Stripe API version format', () => {
    expect(typeof STRIPE_API_VERSION).toBe('string');
    expect(STRIPE_API_VERSION.length).toBeGreaterThan(0);
    // Stripe GA channel API versions follow the YYYY-MM-DD.channel format
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });
});

describe('getStripe', () => {
  let getStripe: typeof import('./stripe').getStripe;
  let stripeConstructor: ReturnType<typeof createStripeConstructorMock>;

  beforeEach(async () => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
    setSharedTestEnv();

    vi.doMock('server-only', () => ({}));
    stripeConstructor = createStripeConstructorMock();
    vi.doMock('stripe', () => ({
      default: stripeConstructor,
    }));

    ({ getStripe } = await import('./stripe'));
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  it('constructs Stripe lazily and returns the same instance on repeated calls', () => {
    expect(stripeConstructor).not.toHaveBeenCalled();

    const first = getStripe();
    const second = getStripe();

    expect(stripeConstructor).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first).toMatchObject({
      apiKey: 'sk_test_dummy',
      options: {
        apiVersion: STRIPE_API_VERSION,
        typescript: true,
      },
    });
  });
});

describe('createContainer', () => {
  let createContainer: typeof import('./container').createContainer;
  let stripeConstructor: ReturnType<typeof createStripeConstructorMock>;

  beforeEach(async () => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
    setSharedTestEnv();

    vi.doMock('server-only', () => ({}));
    stripeConstructor = createStripeConstructorMock();
    vi.doMock('stripe', () => ({
      default: stripeConstructor,
    }));

    ({ createContainer } = await import('./container'));
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
  });

  it('does not initialize Stripe when creating the default container', () => {
    expect(stripeConstructor).not.toHaveBeenCalled();

    const container = createContainer();

    expect(container).toBeDefined();
    expect(stripeConstructor).not.toHaveBeenCalled();
  });
});
