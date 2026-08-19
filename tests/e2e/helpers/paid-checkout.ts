import postgres from 'postgres';
import Stripe from 'stripe';
import { PRICING_DATA } from '@/lib/pricing-data';
import {
  type E2EEntitlementSnapshot,
  removeE2EUserEntitlement,
  resetE2EUserToFirstTimer,
  restoreE2EUserEntitlement,
  restoreE2EUserPaidSubscription,
} from './subscription';

export type PaidCheckoutLifecycleServices = {
  removeEntitlement: () => Promise<E2EEntitlementSnapshot>;
  resetToFirstTimer: () => Promise<void>;
  restoreEntitlement: (snapshot: E2EEntitlementSnapshot) => Promise<void>;
  restorePaidSubscription: () => Promise<void>;
};

export type PaidAnnualCheckoutEvidence = {
  dbRowCount: number;
  dbStatus: string | null;
  dbUsesAnnualPrice: boolean;
  dbPeriodIsFuture: boolean;
  providerStatus: string | null;
  providerUsesAnnualPrice: boolean;
  providerPeriodIsFuture: boolean;
  providerHasNoTrial: boolean;
  providerUsesMappedCustomer: boolean;
  providerUsesAppUser: boolean;
  providerIsTestMode: boolean;
  invoiceStatus: string | null;
  invoiceAmountPaid: number | null;
  invoiceCurrency: string | null;
  invoiceIsTestMode: boolean;
  paymentStatus: string | null;
  paymentIsTestMode: boolean;
  hasCharge: boolean;
};

export type PaidAnnualCheckoutServices = {
  loadEvidence: () => Promise<PaidAnnualCheckoutEvidence>;
};

type PaidCheckoutDbRow = {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  priceId: string;
  currentPeriodEnd: Date;
};

const defaultLifecycleServices: PaidCheckoutLifecycleServices = {
  removeEntitlement: removeE2EUserEntitlement,
  resetToFirstTimer: resetE2EUserToFirstTimer,
  restoreEntitlement: restoreE2EUserEntitlement,
  restorePaidSubscription: restoreE2EUserPaidSubscription,
};

function requireE2EEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[E2E_PAID_CHECKOUT:ENV_MISSING] ${name} is required.`);
  }
  return value;
}

function requireStripeTestKey(): string {
  const key = requireE2EEnv('STRIPE_SECRET_KEY');
  if (!key.startsWith('sk_test_') || key.includes('dummy')) {
    throw new Error(
      '[E2E_PAID_CHECKOUT:STRIPE_MODE] A real Stripe TEST-mode key is required.',
    );
  }
  return key;
}

function getStripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { id?: unknown };
  return typeof record.id === 'string' ? record.id : null;
}

function emptyEvidence(dbRowCount: number): PaidAnnualCheckoutEvidence {
  return {
    dbRowCount,
    dbStatus: null,
    dbUsesAnnualPrice: false,
    dbPeriodIsFuture: false,
    providerStatus: null,
    providerUsesAnnualPrice: false,
    providerPeriodIsFuture: false,
    providerHasNoTrial: false,
    providerUsesMappedCustomer: false,
    providerUsesAppUser: false,
    providerIsTestMode: false,
    invoiceStatus: null,
    invoiceAmountPaid: null,
    invoiceCurrency: null,
    invoiceIsTestMode: false,
    paymentStatus: null,
    paymentIsTestMode: false,
    hasCharge: false,
  };
}

async function loadPaidAnnualCheckoutEvidence(): Promise<PaidAnnualCheckoutEvidence> {
  const databaseUrl = requireE2EEnv('DATABASE_URL');
  const email = requireE2EEnv('E2E_CLERK_USER_USERNAME');
  const annualPriceId = requireE2EEnv('NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL');
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const rows = await sql<PaidCheckoutDbRow[]>`
      SELECT
        app_user.id AS "userId",
        stripe_customer.stripe_customer_id AS "stripeCustomerId",
        subscription.stripe_subscription_id AS "stripeSubscriptionId",
        subscription.status,
        subscription.price_id AS "priceId",
        subscription.current_period_end AS "currentPeriodEnd"
      FROM users app_user
      INNER JOIN stripe_customers stripe_customer
        ON stripe_customer.user_id = app_user.id
      INNER JOIN stripe_subscriptions subscription
        ON subscription.user_id = app_user.id
      WHERE app_user.email = ${email}
    `;
    const row = rows[0];
    if (!row || rows.length !== 1) return emptyEvidence(rows.length);

    const stripe = new Stripe(requireStripeTestKey());
    const subscription = await stripe.subscriptions.retrieve(
      row.stripeSubscriptionId,
    );
    const subscriptionItem = subscription.items.data[0];
    const invoiceId = getStripeId(subscription.latest_invoice);
    const evidence: PaidAnnualCheckoutEvidence = {
      ...emptyEvidence(rows.length),
      dbStatus: row.status,
      dbUsesAnnualPrice: row.priceId === annualPriceId,
      dbPeriodIsFuture: row.currentPeriodEnd.getTime() > Date.now(),
      providerStatus: subscription.status,
      providerUsesAnnualPrice: subscriptionItem?.price.id === annualPriceId,
      providerPeriodIsFuture:
        (subscriptionItem?.current_period_end ?? 0) * 1000 > Date.now(),
      providerHasNoTrial: subscription.trial_end === null,
      providerUsesMappedCustomer:
        getStripeId(subscription.customer) === row.stripeCustomerId,
      providerUsesAppUser: subscription.metadata.user_id === row.userId,
      providerIsTestMode: subscription.livemode === false,
    };

    if (!invoiceId) return evidence;

    const invoice = await stripe.invoices.retrieve(invoiceId);
    evidence.invoiceStatus = invoice.status;
    evidence.invoiceAmountPaid = invoice.amount_paid;
    evidence.invoiceCurrency = invoice.currency;
    evidence.invoiceIsTestMode = invoice.livemode === false;

    const invoicePayments = await stripe.invoicePayments.list({
      invoice: invoiceId,
      status: 'paid',
      limit: 10,
    });
    const invoicePayment = invoicePayments.data[0];
    const paymentIntentId = getStripeId(invoicePayment?.payment.payment_intent);
    if (!paymentIntentId) return evidence;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    evidence.paymentStatus = paymentIntent.status;
    evidence.paymentIsTestMode = paymentIntent.livemode === false;
    evidence.hasCharge = getStripeId(paymentIntent.latest_charge) !== null;
    return evidence;
  } catch (error) {
    const redactedMessage = String(error).replace(
      /\b(cus|sub|clock|acct|req|seti|si|pm|in|price|cs|evt|sk_test)_[A-Za-z0-9]+\b/g,
      '$1_[REDACTED]',
    );
    throw new Error(
      `[E2E_PAID_CHECKOUT:OBSERVATION_FAILED] ${redactedMessage}`,
    );
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch {
      // Ignore observation teardown errors so they cannot mask the primary result.
    }
  }
}

const defaultEvidenceServices: PaidAnnualCheckoutServices = {
  loadEvidence: loadPaidAnnualCheckoutEvidence,
};

export async function prepareE2EUserForPaidCheckout(
  input: { services?: PaidCheckoutLifecycleServices } = {},
): Promise<void> {
  const services = input.services ?? defaultLifecycleServices;
  const snapshot = await services.removeEntitlement();
  await services.resetToFirstTimer();
  await services.restoreEntitlement({
    ...snapshot,
    status: 'canceled',
  });
}

export async function restoreE2EUserAfterPaidCheckout(
  input: { services?: PaidCheckoutLifecycleServices } = {},
): Promise<void> {
  const services = input.services ?? defaultLifecycleServices;
  const failures: unknown[] = [];

  try {
    await services.resetToFirstTimer();
  } catch (error) {
    failures.push(error);
  }

  try {
    await services.restorePaidSubscription();
  } catch (error) {
    failures.push(error);
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      'Paid Checkout E2E cleanup and baseline restore both failed.',
    );
  }
}

export function validatePaidAnnualCheckoutEvidence(
  evidence: PaidAnnualCheckoutEvidence,
): PaidAnnualCheckoutEvidence {
  const checks: ReadonlyArray<{
    code: string;
    valid: boolean;
    message: string;
  }> = [
    {
      code: 'DB_ROW_COUNT',
      valid: evidence.dbRowCount === 1,
      message: `Expected one subscription row; found ${evidence.dbRowCount}.`,
    },
    {
      code: 'DB_STATUS',
      valid: evidence.dbStatus === 'active',
      message: 'The persisted subscription is not active.',
    },
    {
      code: 'DB_PLAN',
      valid: evidence.dbUsesAnnualPrice,
      message: 'The persisted subscription is not annual.',
    },
    {
      code: 'DB_PERIOD',
      valid: evidence.dbPeriodIsFuture,
      message: 'The persisted billing period is not current.',
    },
    {
      code: 'PROVIDER_STATUS',
      valid: evidence.providerStatus === 'active',
      message: 'The Stripe subscription is not active.',
    },
    {
      code: 'PROVIDER_PLAN',
      valid: evidence.providerUsesAnnualPrice,
      message: 'The Stripe subscription is not annual.',
    },
    {
      code: 'PROVIDER_PERIOD',
      valid: evidence.providerPeriodIsFuture,
      message: 'The Stripe billing period is not current.',
    },
    {
      code: 'PROVIDER_TRIAL',
      valid: evidence.providerHasNoTrial,
      message: 'The paid Checkout unexpectedly created a trial.',
    },
    {
      code: 'PROVIDER_CUSTOMER',
      valid: evidence.providerUsesMappedCustomer,
      message: 'The subscription does not belong to the mapped customer.',
    },
    {
      code: 'PROVIDER_USER',
      valid: evidence.providerUsesAppUser,
      message: 'The subscription metadata does not name the app user.',
    },
    {
      code: 'PROVIDER_MODE',
      valid: evidence.providerIsTestMode,
      message: 'The subscription is not in Stripe TEST mode.',
    },
    {
      code: 'INVOICE_STATUS',
      valid: evidence.invoiceStatus === 'paid',
      message: 'The initial annual invoice is not paid.',
    },
    {
      code: 'INVOICE_AMOUNT',
      valid: evidence.invoiceAmountPaid === PRICING_DATA.annual.amountCents,
      message: 'The paid invoice amount does not match the annual plan.',
    },
    {
      code: 'INVOICE_CURRENCY',
      valid: evidence.invoiceCurrency === PRICING_DATA.annual.currency,
      message: 'The paid invoice currency does not match the annual plan.',
    },
    {
      code: 'INVOICE_MODE',
      valid: evidence.invoiceIsTestMode,
      message: 'The invoice is not in Stripe TEST mode.',
    },
    {
      code: 'PAYMENT_STATUS',
      valid: evidence.paymentStatus === 'succeeded',
      message: 'The invoice payment did not succeed.',
    },
    {
      code: 'PAYMENT_MODE',
      valid: evidence.paymentIsTestMode,
      message: 'The payment is not in Stripe TEST mode.',
    },
    {
      code: 'CHARGE_MISSING',
      valid: evidence.hasCharge,
      message: 'The successful payment has no charge.',
    },
  ];

  for (const check of checks) {
    if (!check.valid) {
      throw new Error(`[E2E_PAID_CHECKOUT:${check.code}] ${check.message}`);
    }
  }

  return evidence;
}

export async function expectE2EUserHasPaidAnnualSubscription(
  input: { services?: PaidAnnualCheckoutServices } = {},
): Promise<PaidAnnualCheckoutEvidence> {
  const services = input.services ?? defaultEvidenceServices;
  return validatePaidAnnualCheckoutEvidence(await services.loadEvidence());
}
