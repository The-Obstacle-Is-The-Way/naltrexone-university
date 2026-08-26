import postgres from 'postgres';
import type Stripe from 'stripe';
import { isUsableStripeTestKey } from '@/tests/shared/stripe-provider-gate';
import { createStripeTestClient } from './stripe-test-client';

const DEFAULT_LOCAL_E2E_STRIPE_OWNER = 'local-dev';
const STRIPE_PAGE_SIZE = 100;

type StripeCustomerSeedResult = {
  stripeCustomerId: string;
  canTrustLocalSubscriptionRow: boolean;
};

/**
 * Idempotent seed function that ensures the E2E test user has:
 * 1. A row in the `users` table
 * 2. A Stripe customer (mirrored in `stripe_customers`)
 * 3. An active subscription (mirrored in `stripe_subscriptions`)
 *
 * Uses the Stripe API with `pm_card_visa` — never touches Stripe's hosted UI.
 * Must NOT import from `lib/db.ts` or `lib/stripe.ts` (they use `server-only`).
 */
export async function seedTestSubscription(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  const email = process.env.E2E_CLERK_USER_USERNAME;
  const e2eStripeOwner = resolveE2EStripeOwner(stripeSecretKey);
  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY;

  if (
    !databaseUrl ||
    !stripeSecretKey ||
    !clerkSecretKey ||
    !email ||
    !priceId
  ) {
    throw new Error(
      'Missing required env vars for E2E subscription seeding: ' +
        'DATABASE_URL, STRIPE_SECRET_KEY, CLERK_SECRET_KEY, ' +
        'E2E_CLERK_USER_USERNAME, NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY',
    );
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const stripe = createStripeTestClient(stripeSecretKey);

  try {
    // ── 1. Resolve Clerk user ID ──────────────────────────────────────
    const clerkUserId = await resolveClerkUserId(email, clerkSecretKey);

    // ── 2. Ensure DB user row ─────────────────────────────────────────
    const userId = await ensureDbUser(sql, clerkUserId, email);

    // ── 3. Ensure Stripe customer + DB mirror ─────────────────────────
    const stripeCustomer = await ensureStripeCustomer(
      sql,
      stripe,
      userId,
      clerkUserId,
      email,
      e2eStripeOwner,
    );

    // ── 4. Ensure active subscription + DB mirror ─────────────────────
    await ensureActiveSubscription(
      sql,
      stripe,
      userId,
      stripeCustomer.stripeCustomerId,
      priceId,
      e2eStripeOwner,
      stripeCustomer.canTrustLocalSubscriptionRow,
    );
  } finally {
    await sql.end();
  }
}

function resolveE2EStripeOwner(stripeSecretKey: string | undefined): string {
  const configuredOwner = process.env.E2E_STRIPE_OWNER?.trim();
  if (configuredOwner) return configuredOwner;

  if (isUsableStripeTestKey(stripeSecretKey)) {
    throw new Error(
      'E2E_STRIPE_OWNER is required when STRIPE_SECRET_KEY is real',
    );
  }

  return DEFAULT_LOCAL_E2E_STRIPE_OWNER;
}

function hasE2EOwner(
  metadata: Stripe.Metadata | null | undefined,
  e2eStripeOwner: string,
): boolean {
  return metadata?.e2e_owner === e2eStripeOwner;
}

async function findOwnerMatchedStripeCustomer(
  stripe: Stripe,
  email: string,
  e2eStripeOwner: string,
): Promise<Stripe.Customer | undefined> {
  for await (const customer of stripe.customers.list({
    email,
    limit: STRIPE_PAGE_SIZE,
  })) {
    if (hasE2EOwner(customer.metadata, e2eStripeOwner)) {
      return customer;
    }
  }
  return undefined;
}

async function listOwnerMatchedStripeSubscriptions(
  stripe: Stripe,
  stripeCustomerId: string,
  e2eStripeOwner: string,
): Promise<Stripe.Subscription[]> {
  const ownerMatchedSubscriptions: Stripe.Subscription[] = [];

  for await (const subscription of stripe.subscriptions.list({
    customer: stripeCustomerId,
    limit: STRIPE_PAGE_SIZE,
  })) {
    if (hasE2EOwner(subscription.metadata, e2eStripeOwner)) {
      ownerMatchedSubscriptions.push(subscription);
    }
  }

  return ownerMatchedSubscriptions;
}

// ── Clerk ────────────────────────────────────────────────────────────────

async function resolveClerkUserId(
  email: string,
  clerkSecretKey: string,
): Promise<string> {
  const url = `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${clerkSecretKey}` },
  });
  if (!res.ok) {
    throw new Error(`Clerk API error ${res.status}: ${await res.text()}`);
  }
  const users = (await res.json()) as Array<{ id: string }>;
  const [user] = users;
  if (user === undefined) {
    throw new Error(`No Clerk user found for email ${email}`);
  }
  return user.id;
}

// ── DB: users ────────────────────────────────────────────────────────────

async function ensureDbUser(
  sql: postgres.Sql,
  clerkUserId: string,
  email: string,
): Promise<string> {
  const [row] = await sql`
    INSERT INTO users (clerk_user_id, email)
    VALUES (${clerkUserId}, ${email})
    ON CONFLICT (email) DO UPDATE
      SET clerk_user_id = EXCLUDED.clerk_user_id,
          updated_at    = now()
    RETURNING id
  `;
  if (row === undefined) {
    throw new Error('Failed to upsert E2E database user');
  }
  return row.id as string;
}

// ── Stripe customer ──────────────────────────────────────────────────────

async function ensureStripeCustomer(
  sql: postgres.Sql,
  stripe: Stripe,
  userId: string,
  clerkUserId: string,
  email: string,
  e2eStripeOwner: string,
): Promise<StripeCustomerSeedResult> {
  // Check DB first
  const [existing] = await sql`
    SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ${userId}
  `;
  if (existing) {
    const existingCustomer = await stripe.customers.retrieve(
      existing.stripe_customer_id as string,
    );
    if (
      !('deleted' in existingCustomer && existingCustomer.deleted) &&
      hasE2EOwner(existingCustomer.metadata, e2eStripeOwner)
    ) {
      return {
        stripeCustomerId: existing.stripe_customer_id as string,
        canTrustLocalSubscriptionRow: true,
      };
    }
  }

  // Check Stripe (may exist from a previous run not mirrored in DB)
  let stripeCustomerId: string;
  const ownerMatchedCustomer = await findOwnerMatchedStripeCustomer(
    stripe,
    email,
    e2eStripeOwner,
  );

  if (ownerMatchedCustomer) {
    stripeCustomerId = ownerMatchedCustomer.id;
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        user_id: userId,
        clerk_user_id: clerkUserId,
        e2e_owner: e2eStripeOwner,
      },
    });
    stripeCustomerId = customer.id;
  }

  // Upsert into DB
  await sql`
    INSERT INTO stripe_customers (user_id, stripe_customer_id)
    VALUES (${userId}, ${stripeCustomerId})
    ON CONFLICT (user_id) DO UPDATE
      SET stripe_customer_id = EXCLUDED.stripe_customer_id
  `;

  return {
    stripeCustomerId,
    canTrustLocalSubscriptionRow: false,
  };
}

// ── Stripe subscription ──────────────────────────────────────────────────

async function ensureActiveSubscription(
  sql: postgres.Sql,
  stripe: Stripe,
  userId: string,
  stripeCustomerId: string,
  priceId: string,
  e2eStripeOwner: string,
  canTrustLocalSubscriptionRow: boolean,
): Promise<void> {
  // Check if we already have an active subscription with time remaining
  const [existing] = await sql`
    SELECT stripe_subscription_id, status, current_period_end
    FROM stripe_subscriptions
    WHERE user_id = ${userId}
  `;

  if (
    canTrustLocalSubscriptionRow &&
    existing &&
    existing.status === 'active' &&
    new Date(existing.current_period_end as string) > new Date()
  ) {
    return; // Still active — nothing to do
  }

  // Ensure customer has a default payment method (pm_card_visa)
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (
    !('deleted' in customer && customer.deleted) &&
    !customer.invoice_settings.default_payment_method
  ) {
    const pm = await stripe.paymentMethods.attach('pm_card_visa', {
      customer: stripeCustomerId,
    });
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
  }

  // Cancel any non-active subscriptions on this customer to avoid conflicts
  const ownerMatchedSubscriptions = await listOwnerMatchedStripeSubscriptions(
    stripe,
    stripeCustomerId,
    e2eStripeOwner,
  );
  for (const sub of ownerMatchedSubscriptions) {
    if (sub.status !== 'active') {
      await stripe.subscriptions.cancel(sub.id);
    }
  }

  // If there's an active sub in Stripe already, reuse it
  const activeSub = ownerMatchedSubscriptions.find(
    (s) => s.status === 'active',
  );
  let subscriptionId: string;
  let currentPeriodEnd: Date;

  if (activeSub) {
    if (activeSub.metadata?.user_id !== userId) {
      await stripe.subscriptions.update(activeSub.id, {
        metadata: {
          ...(activeSub.metadata ?? {}),
          user_id: userId,
          e2e_owner: e2eStripeOwner,
        },
      });
    }
    subscriptionId = activeSub.id;
    const [activeSubscriptionItem] = activeSub.items.data;
    if (activeSubscriptionItem === undefined) {
      throw new Error('Active Stripe subscription has no items');
    }
    currentPeriodEnd = new Date(
      activeSubscriptionItem.current_period_end * 1000,
    );
  } else {
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      metadata: {
        user_id: userId,
        e2e_owner: e2eStripeOwner,
      },
    });
    subscriptionId = subscription.id;
    const [subscriptionItem] = subscription.items.data;
    if (subscriptionItem === undefined) {
      throw new Error('Created Stripe subscription has no items');
    }
    currentPeriodEnd = new Date(subscriptionItem.current_period_end * 1000);
  }

  // Upsert into DB
  await sql`
    INSERT INTO stripe_subscriptions (
      user_id, stripe_subscription_id, status, price_id,
      current_period_end, cancel_at_period_end
    )
    VALUES (
      ${userId}, ${subscriptionId}, 'active', ${priceId},
      ${currentPeriodEnd.toISOString()}, false
    )
    ON CONFLICT (user_id) DO UPDATE
      SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          status                 = EXCLUDED.status,
          price_id               = EXCLUDED.price_id,
          current_period_end     = EXCLUDED.current_period_end,
          cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
          updated_at             = now()
  `;
}
