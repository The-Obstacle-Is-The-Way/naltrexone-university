import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  type CredentialHealthCheckServices,
  runE2ECredentialHealthCheck,
} from './credential-health-check';

const MONTHLY_PRICE_ID = 'price_monthly';
const ANNUAL_PRICE_ID = 'price_annual';

function createEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    E2E_CLERK_USER_USERNAME: 'e2e-test@example.com',
    E2E_CLERK_USER_PASSWORD: 'E2eTestPass1',
    STRIPE_SECRET_KEY: 'sk_test_stripe',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: ANNUAL_PRICE_ID,
  } as NodeJS.ProcessEnv;
}

function createNonStripeServices(): Partial<CredentialHealthCheckServices> {
  return {
    checkDatabaseConnectivity: vi.fn(async (_sql) => {}),
    verifyMigrationLedger: vi.fn(async (_sql) => {}),
    verifyIdempotencySchema: vi.fn(async (_sql) => {}),
    resolveClerkUserId: vi.fn(async () => 'user_123'),
    verifyClerkPassword: vi.fn(async () => true),
  };
}

function createRecurringPrice(
  interval: 'month' | 'year',
  overrides: Partial<Stripe.Price> = {},
): Stripe.Response<Stripe.Price> {
  return {
    active: true,
    type: 'recurring',
    recurring: { interval } as Stripe.Price.Recurring,
    ...overrides,
  } as Stripe.Response<Stripe.Price>;
}

function spyOnStripeDefaults() {
  const stripeProbe = new Stripe('sk_test_probe');
  const accountsResourcePrototype = Object.getPrototypeOf(stripeProbe.accounts);
  const pricesResourcePrototype = Object.getPrototypeOf(stripeProbe.prices);
  const accountRetrieve = vi
    .spyOn(accountsResourcePrototype, 'retrieve')
    .mockResolvedValue({} as Stripe.Response<Stripe.Account>);
  const priceRetrieve = vi.spyOn(pricesResourcePrototype, 'retrieve');
  return {
    accountRetrieve,
    priceRetrieve,
    restore: () => {
      priceRetrieve.mockRestore();
      accountRetrieve.mockRestore();
    },
  };
}

async function captureHealthCheckError(): Promise<Error | null> {
  try {
    await runE2ECredentialHealthCheck({
      env: createEnv(),
      services: createNonStripeServices(),
    });
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe('runE2ECredentialHealthCheck default Stripe services', () => {
  it('maps Stripe authentication failures to credential-invalid code', async () => {
    const harness = spyOnStripeDefaults();
    harness.accountRetrieve.mockRejectedValue(
      new Stripe.errors.StripeAuthenticationError({
        type: 'invalid_request_error',
        message: 'invalid key',
      }),
    );

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_SECRET_KEY_INVALID]',
      );
    } finally {
      harness.restore();
    }
  });

  it('maps non-auth Stripe price errors to API-unavailable code', async () => {
    const harness = spyOnStripeDefaults();
    harness.priceRetrieve.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({
        type: 'api_error',
        message: 'connection error',
      }),
    );

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_API_UNAVAILABLE]',
      );
    } finally {
      harness.restore();
    }
  });

  it('identifies an invalid annual price separately from the monthly price', async () => {
    const harness = spyOnStripeDefaults();
    harness.priceRetrieve
      .mockResolvedValueOnce(createRecurringPrice('month'))
      .mockRejectedValueOnce(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          message: 'No such price',
        }),
      );

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_ANNUAL_PRICE_ID_INVALID]',
      );
      expect(caughtError?.message).not.toContain(ANNUAL_PRICE_ID);
    } finally {
      harness.restore();
    }
  });

  it('rejects an inactive annual price without printing its ID', async () => {
    const harness = spyOnStripeDefaults();
    harness.priceRetrieve
      .mockResolvedValueOnce(createRecurringPrice('month'))
      .mockResolvedValueOnce(createRecurringPrice('year', { active: false }));

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_ANNUAL_PRICE_MISCONFIGURED]',
      );
      expect(caughtError?.message).not.toContain(ANNUAL_PRICE_ID);
    } finally {
      harness.restore();
    }
  });

  it('rejects a one-time monthly price without printing its ID', async () => {
    const harness = spyOnStripeDefaults();
    harness.priceRetrieve.mockResolvedValueOnce({
      active: true,
      type: 'one_time',
      recurring: null,
    } as Stripe.Response<Stripe.Price>);

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_MONTHLY_PRICE_MISCONFIGURED]',
      );
      expect(caughtError?.message).not.toContain(MONTHLY_PRICE_ID);
    } finally {
      harness.restore();
    }
  });

  it('rejects an annual price billed monthly', async () => {
    const harness = spyOnStripeDefaults();
    harness.priceRetrieve
      .mockResolvedValueOnce(createRecurringPrice('month'))
      .mockResolvedValueOnce(createRecurringPrice('month'));

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_ANNUAL_PRICE_MISCONFIGURED]',
      );
      expect(caughtError?.message).not.toContain(ANNUAL_PRICE_ID);
    } finally {
      harness.restore();
    }
  });

  it('omits the price ID from the API-unavailable price failure', async () => {
    const harness = spyOnStripeDefaults();
    harness.priceRetrieve
      .mockResolvedValueOnce(createRecurringPrice('month'))
      .mockRejectedValueOnce(
        new Stripe.errors.StripeConnectionError({
          type: 'api_error',
          message: 'connection error',
        }),
      );

    try {
      const caughtError = await captureHealthCheckError();
      expect(caughtError?.message).toContain(
        '[E2E_PREFLIGHT:STRIPE_API_UNAVAILABLE]',
      );
      expect(caughtError?.message).not.toContain(ANNUAL_PRICE_ID);
    } finally {
      harness.restore();
    }
  });
});
