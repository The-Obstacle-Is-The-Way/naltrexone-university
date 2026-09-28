import postgres from 'postgres';
import type Stripe from 'stripe';
import { createStripeTestClient } from './stripe-test-client';

// DEBT-414 F04: helpers for the observational Billing-portal cancellation
// lane. Every Stripe mutation is refused unless the subscription belongs to
// this run's E2E Stripe owner, and every database read is refused unless the
// target is the isolated local E2E database.

export type E2ELocalSubscription = {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
};

function requireLocalDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
    throw new Error('Portal cancellation evidence requires the local E2E DB.');
  }
  return databaseUrl;
}

export async function readE2ELocalSubscription(): Promise<E2ELocalSubscription> {
  const email = process.env.E2E_CLERK_USER_USERNAME;
  if (!email) throw new Error('E2E_CLERK_USER_USERNAME is required.');
  const sql = postgres(requireLocalDatabaseUrl(), { max: 1 });
  try {
    const [row] = await sql<E2ELocalSubscription[]>`
      SELECT subscription.stripe_subscription_id AS id,
        subscription.status,
        subscription.cancel_at_period_end AS "cancelAtPeriodEnd",
        subscription.current_period_end AS "currentPeriodEnd"
      FROM users app_user
      JOIN stripe_subscriptions subscription
        ON subscription.user_id = app_user.id
      WHERE app_user.email = ${email}
    `;
    if (!row) throw new Error('The E2E user has no stored subscription.');
    return row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function retrieveOwnedSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customer = await stripe.customers.retrieve(
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id,
  );
  if (
    subscription.livemode ||
    customer.deleted ||
    !process.env.E2E_STRIPE_OWNER ||
    customer.metadata.e2e_owner !== process.env.E2E_STRIPE_OWNER
  ) {
    throw new Error('The subscription must belong to this E2E Stripe owner.');
  }
  return subscription;
}

export async function readE2EStripeSubscription(subscriptionId: string) {
  const subscription = await retrieveOwnedSubscription(
    createStripeTestClient(),
    subscriptionId,
  );
  const item = subscription.items.data[0];
  if (!item) throw new Error('The E2E subscription has no item.');
  return {
    status: subscription.status,
    cancelAt: subscription.cancel_at,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: item.current_period_end,
  };
}
