import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtureUserId = '00000000-0000-4000-8000-000000000001';
const fixtureFuturePeriodEnd = new Date('2030-01-01T00:00:00.000Z');

type PaidCheckoutModule = typeof import('./paid-checkout');

type DefaultServicesHarness = {
  loadModule: () => Promise<PaidCheckoutModule>;
  paymentIntentsRetrieve: ReturnType<typeof vi.fn>;
  sqlEnd: ReturnType<typeof vi.fn>;
  subscriptionsRetrieve: ReturnType<typeof vi.fn>;
};

function createDbRow() {
  return {
    userId: fixtureUserId,
    stripeCustomerId: 'cus_fixture',
    stripeSubscriptionId: 'sub_fixture',
    status: 'active',
    priceId: 'price_annual',
    currentPeriodEnd: fixtureFuturePeriodEnd,
  };
}

function installDefaultServicesHarness(
  input: {
    dbRows?: ReturnType<typeof createDbRow>[];
    subscriptionError?: Error;
  } = {},
): DefaultServicesHarness {
  const sqlEnd = vi.fn(async () => {});
  const sql = Object.assign(
    vi.fn(async () => input.dbRows ?? [createDbRow()]),
    {
      end: sqlEnd,
    },
  );
  vi.doMock('postgres', () => ({ default: vi.fn(() => sql) }));

  const subscriptionsRetrieve = input.subscriptionError
    ? vi.fn(async () => {
        throw input.subscriptionError;
      })
    : vi.fn(async () => ({
        status: 'active',
        items: {
          data: [
            {
              price: { id: 'price_annual' },
              current_period_end: Math.floor(
                fixtureFuturePeriodEnd.getTime() / 1000,
              ),
            },
          ],
        },
        trial_end: null,
        customer: 'cus_fixture',
        metadata: { user_id: fixtureUserId },
        livemode: false,
        latest_invoice: 'in_fixture',
      }));
  const invoicesRetrieve = vi.fn(async () => ({
    status: 'paid',
    amount_paid: 19_900,
    currency: 'usd',
    livemode: false,
  }));
  const invoicePaymentsList = vi.fn(async () => ({
    data: [{ payment: { payment_intent: 'pi_fixture' } }],
  }));
  const paymentIntentsRetrieve = vi.fn(async () => ({
    status: 'succeeded',
    livemode: false,
    latest_charge: 'ch_fixture',
  }));
  const stripeClient = {
    subscriptions: { retrieve: subscriptionsRetrieve },
    invoices: { retrieve: invoicesRetrieve },
    invoicePayments: { list: invoicePaymentsList },
    paymentIntents: { retrieve: paymentIntentsRetrieve },
  };
  vi.doMock('stripe', () => ({
    default: vi.fn(function StripeConstructor() {
      return stripeClient;
    }),
  }));

  return {
    loadModule: () => import('./paid-checkout'),
    paymentIntentsRetrieve,
    sqlEnd,
    subscriptionsRetrieve,
  };
}

describe('paid Checkout default evidence services', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    );
    vi.stubEnv('E2E_CLERK_USER_USERNAME', 'e2e-test@example.com');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL', 'price_annual');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('loads and validates the full database-to-charge receipt', async () => {
    const harness = installDefaultServicesHarness();
    const { expectE2EUserHasPaidAnnualSubscription } =
      await harness.loadModule();

    const evidence = await expectE2EUserHasPaidAnnualSubscription();

    expect(evidence).toMatchObject({
      dbRowCount: 1,
      dbStatus: 'active',
      dbUsesAnnualPrice: true,
      providerStatus: 'active',
      providerUsesAnnualPrice: true,
      invoiceStatus: 'paid',
      invoiceAmountPaid: 19_900,
      paymentStatus: 'succeeded',
      hasCharge: true,
    });
    expect(harness.subscriptionsRetrieve).toHaveBeenCalledWith('sub_fixture');
    expect(harness.paymentIntentsRetrieve).toHaveBeenCalledWith('pi_fixture');
    expect(harness.sqlEnd).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('fails closed before provider reads when the database row is absent', async () => {
    const harness = installDefaultServicesHarness({ dbRows: [] });
    const { expectE2EUserHasPaidAnnualSubscription } =
      await harness.loadModule();

    await expect(expectE2EUserHasPaidAnnualSubscription()).rejects.toThrow(
      '[E2E_PAID_CHECKOUT:DB_ROW_COUNT]',
    );

    expect(harness.subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(harness.sqlEnd).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('redacts provider identifiers from observation failures', async () => {
    const harness = installDefaultServicesHarness({
      subscriptionError: new Error(
        'lookup failed for sub_sensitive and price_sensitive',
      ),
    });
    const { expectE2EUserHasPaidAnnualSubscription } =
      await harness.loadModule();

    let caughtError: Error | null = null;
    try {
      await expectE2EUserHasPaidAnnualSubscription();
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError?.message).toContain(
      '[E2E_PAID_CHECKOUT:OBSERVATION_FAILED]',
    );
    expect(caughtError?.message).toContain('sub_[REDACTED]');
    expect(caughtError?.message).toContain('price_[REDACTED]');
    expect(caughtError?.message).not.toContain('sub_sensitive');
    expect(caughtError?.message).not.toContain('price_sensitive');
    expect(harness.sqlEnd).toHaveBeenCalledWith({ timeout: 5 });
  });
});
