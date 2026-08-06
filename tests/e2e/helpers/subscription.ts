import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import Stripe from 'stripe';
import { seedTestSubscription } from './seed-test-user';

type E2EBillingState = {
  userId: string;
  stripeCustomerId: string;
};

type E2EStripeSubscriptionRow = {
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
};

const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES = new Set([
  'canceled',
  'incomplete_expired',
]);

export async function ensureSubscribed(page: Page): Promise<void> {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
  await expect(page.getByText("You're already subscribed")).toBeVisible({
    timeout: 15_000,
  });
}

function requireE2EEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for E2E trial subscription helpers.`);
  }
  return value;
}

async function resolveE2EBillingState(
  sql: ReturnType<typeof postgres>,
): Promise<E2EBillingState> {
  const email = requireE2EEnv('E2E_CLERK_USER_USERNAME');
  const rows = await sql<E2EBillingState[]>`
    SELECT
      u.id AS "userId",
      sc.stripe_customer_id AS "stripeCustomerId"
    FROM users u
    INNER JOIN stripe_customers sc ON sc.user_id = u.id
    WHERE u.email = ${email}
    LIMIT 1
  `;
  const state = rows[0];
  if (!state) {
    throw new Error(
      'E2E Stripe customer mapping is missing; global setup must seed the E2E user before trial-start tests.',
    );
  }
  return state;
}

function createStripeClient(): Stripe {
  return new Stripe(requireE2EEnv('STRIPE_SECRET_KEY'));
}

async function cancelCustomerSubscriptions(
  stripe: Stripe,
  stripeCustomerId: string,
): Promise<void> {
  for await (const subscription of stripe.subscriptions.list({
    customer: stripeCustomerId,
    limit: 100,
  })) {
    if (TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      continue;
    }
    await stripe.subscriptions.cancel(subscription.id);
  }
}

async function clearCustomerPaymentMethods(
  stripe: Stripe,
  stripeCustomerId: string,
): Promise<void> {
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if ('deleted' in customer && customer.deleted) {
    throw new Error('E2E Stripe customer was unexpectedly deleted.');
  }

  if (customer.invoice_settings.default_payment_method) {
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: '' },
    });
  }

  for await (const paymentMethod of stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: 'card',
    limit: 100,
  })) {
    await stripe.paymentMethods.detach(paymentMethod.id);
  }
}

export async function resetE2EUserToFirstTimer(): Promise<void> {
  const sql = postgres(requireE2EEnv('DATABASE_URL'), { max: 1 });
  const stripe = createStripeClient();

  try {
    const { userId, stripeCustomerId } = await resolveE2EBillingState(sql);
    await cancelCustomerSubscriptions(stripe, stripeCustomerId);
    await clearCustomerPaymentMethods(stripe, stripeCustomerId);
    await sql`
      DELETE FROM stripe_subscriptions
      WHERE user_id = ${userId}
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function restoreE2EUserPaidSubscription(): Promise<void> {
  await seedTestSubscription();
}

export async function completeNoCardTrialCheckout(page: Page): Promise<void> {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const termsCheckbox = page.getByRole('checkbox', {
    name: /I agree to .*Terms of Service and Privacy Policy/i,
  });
  await expect(termsCheckbox).toBeVisible({ timeout: 30_000 });
  await termsCheckbox.check();
  await expect(termsCheckbox).toBeChecked();

  const startTrialButton = page
    .getByRole('button', {
      name: /start (free )?trial|subscribe|continue/i,
    })
    .first();
  await expect(startTrialButton).toBeVisible({ timeout: 30_000 });
  await startTrialButton.click();
}

export async function expectE2EUserHasTrialWithoutPaymentMethod(): Promise<void> {
  const sql = postgres(requireE2EEnv('DATABASE_URL'), { max: 1 });
  const stripe = createStripeClient();

  try {
    const { userId, stripeCustomerId } = await resolveE2EBillingState(sql);
    const rows = await sql<E2EStripeSubscriptionRow[]>`
      SELECT
        stripe_subscription_id AS "stripeSubscriptionId",
        status,
        current_period_end AS "currentPeriodEnd"
      FROM stripe_subscriptions
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    const subscriptionRow = rows[0];

    expect(subscriptionRow).toBeDefined();
    expect(subscriptionRow?.status).toBe('trialing');
    expect(subscriptionRow?.currentPeriodEnd.getTime()).toBeGreaterThan(
      Date.now(),
    );

    const subscription = await stripe.subscriptions.retrieve(
      subscriptionRow?.stripeSubscriptionId ?? '',
    );
    expect(subscription.status).toBe('trialing');
    expect(subscription.default_payment_method).toBeNull();

    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if ('deleted' in customer && customer.deleted) {
      throw new Error('E2E Stripe customer was unexpectedly deleted.');
    }
    expect(customer.invoice_settings.default_payment_method).toBeNull();

    const cardPaymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
      limit: 1,
    });
    expect(cardPaymentMethods.data).toHaveLength(0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
