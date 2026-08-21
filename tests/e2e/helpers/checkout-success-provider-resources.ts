import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { syncCheckoutSuccess } from '@/app/(marketing)/checkout/success/checkout-success-sync';
import * as schema from '@/db/schema';
import { createCheckoutRenewalTerms } from '@/lib/pricing-data';
import {
  getSubscriptionPlanFromPriceId,
  type StripePriceIds,
} from '@/src/adapters/config/stripe-prices';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  FakeAuthGateway,
  type FakeLogger,
} from '@/src/application/test-helpers/fakes';
import type { User } from '@/src/domain/entities';

export type ContractShape = 'annual' | 'monthly-trial';

export type ContractResources = {
  userId: string | null;
  appSessionId: string | null;
  appCustomerId: string | null;
  completedCustomerId: string | null;
  marker: string | null;
};

export type StripeCheckoutSessionLookup = {
  checkout: {
    sessions: {
      list(
        params: Stripe.Checkout.SessionListParams,
      ): PromiseLike<{ data: Stripe.Checkout.Session[] }>;
      retrieve(
        id: string,
        params: Stripe.Checkout.SessionRetrieveParams,
      ): PromiseLike<Stripe.Checkout.Session>;
    };
  };
};

class CheckoutRedirect extends Error {
  constructor(readonly url: string) {
    super(`Checkout redirected to ${url}`);
  }
}

export function requireProviderEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[E2E_PROVIDER_CONTRACT:ENV_MISSING] ${name}`);
  return value;
}

export function getStripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export function redactStripeIdentifiers(value: unknown): string {
  return String(value).replace(
    /(cus|sub|clock|acct|req|seti|si|pm|in|price|cs|evt|sk_test)_[A-Za-z0-9]+/g,
    '$1_[REDACTED]',
  );
}

export function getPersistedSubscriptionPlan(
  priceId: string | null | undefined,
  priceIds: StripePriceIds,
) {
  return priceId ? getSubscriptionPlanFromPriceId(priceId, priceIds) : null;
}

export async function finalizeProviderContract(input: {
  primaryError?: unknown;
  cleanup: () => Promise<void>;
  close: () => Promise<void>;
}): Promise<void> {
  let cleanupError: unknown;
  try {
    await input.cleanup();
  } catch (error) {
    cleanupError = error;
  }

  let closeError: unknown;
  try {
    await input.close();
  } catch (error) {
    closeError = error;
  }

  if (input.primaryError) {
    const secondaryFailures = [cleanupError, closeError]
      .filter((error) => error !== undefined)
      .map(redactStripeIdentifiers);
    const secondarySuffix =
      secondaryFailures.length > 0
        ? ` | secondary: ${secondaryFailures.join(' | ')}`
        : '';
    throw new Error(
      `[E2E_PROVIDER_CONTRACT:FAILED] ${redactStripeIdentifiers(input.primaryError)}${secondarySuffix}`,
    );
  }
  if (cleanupError) throw cleanupError;
  if (closeError) {
    throw new Error(
      `[E2E_PROVIDER_CONTRACT:CLOSE_FAILED] ${redactStripeIdentifiers(closeError)}`,
    );
  }
}

export function sessionHasExpectedRenewalTerms(
  session: Stripe.Checkout.Session,
  userId: string,
  shape: ContractShape,
): boolean {
  const plan = shape === 'annual' ? 'annual' : 'monthly';
  const terms = createCheckoutRenewalTerms(plan, shape === 'monthly-trial');
  const expectedMetadata = {
    checkout_variant: shape === 'annual' ? 'standard' : 'trial:7',
    renewal_user_id: userId,
    renewal_plan: plan,
    renewal_amount_cents: String(terms.amountCents),
    renewal_currency: terms.currency,
    renewal_frequency: terms.frequency,
    renewal_disclosure_snapshot: terms.disclosureSnapshot,
    renewal_disclosure_version: terms.disclosureVersion,
    renewal_terms_version: terms.termsVersion,
    renewal_terms_hash: terms.termsHash,
    renewal_cancellation_method: terms.cancellationMethod,
  };
  return Object.entries(expectedMetadata).every(
    ([key, value]) => session.metadata?.[key] === value,
  );
}

export async function createApplicationUser(
  db: DrizzleDb,
  shape: ContractShape,
): Promise<User & { clerkUserId: string }> {
  const suffix = randomUUID().replaceAll('-', '');
  const [row] = await db
    .insert(schema.users)
    .values({
      clerkUserId: `user_debt471_${suffix}`,
      email: `debt471-${shape}-${suffix}@example.com`,
    })
    .returning();
  if (!row) throw new Error('Failed to create the provider-contract user.');
  return row;
}

export async function findCreatedApplicationSession(
  stripe: Stripe,
  customerId: string,
  userId: string,
): Promise<Stripe.Checkout.Session> {
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    status: 'open',
    limit: 10,
  });
  const session = sessions.data.find(
    (candidate) => candidate.client_reference_id === userId,
  );
  if (!session) throw new Error('Application Checkout Session was not found.');
  return stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items'],
  });
}

export async function findTriggeredSession(
  stripe: StripeCheckoutSessionLookup,
  marker: string,
  triggerStartedAt: number,
): Promise<Stripe.Checkout.Session> {
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: triggerStartedAt },
    limit: 100,
  });
  const session = sessions.data.find(
    (candidate) =>
      candidate.client_reference_id === marker &&
      candidate.status === 'complete',
  );
  if (!session) throw new Error('Triggered Checkout Session was not found.');
  return stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items'],
  });
}

async function cleanStripeProducts(
  stripe: Stripe,
  marker: string,
): Promise<void> {
  const products = await stripe.products.list({ limit: 100 });
  for (const product of products.data) {
    if (product.metadata.e2e_marker !== marker) continue;
    const prices = await stripe.prices.list({
      product: product.id,
      limit: 100,
    });
    for (const price of prices.data) {
      if (price.active) await stripe.prices.update(price.id, { active: false });
    }
    if (product.active) {
      await stripe.products.update(product.id, { active: false });
    }
  }
}

export async function cleanupContractResources(
  db: DrizzleDb,
  stripe: Stripe,
  resources: ContractResources,
): Promise<void> {
  const failures: unknown[] = [];
  if (resources.appSessionId) {
    try {
      await stripe.checkout.sessions.expire(resources.appSessionId);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const customerId of [
    resources.completedCustomerId,
    resources.appCustomerId,
  ]) {
    if (!customerId) continue;
    try {
      await stripe.customers.del(customerId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (resources.marker) {
    try {
      await cleanStripeProducts(stripe, resources.marker);
    } catch (error) {
      failures.push(error);
    }
  }
  if (resources.userId) {
    try {
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, resources.userId));
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `[E2E_PROVIDER_CONTRACT:CLEANUP_FAILED] ${failures.map(redactStripeIdentifiers).join(' | ')}`,
    );
  }
}

export async function assertOpenSessionRejected(input: {
  sessionId: string;
  user: User;
  stripe: Stripe;
  db: DrizzleDb;
  subscriptions: DrizzleSubscriptionRepository;
  logger: FakeLogger;
  priceIds: { monthly: string; annual: string };
  appUrl: string;
}): Promise<boolean> {
  try {
    await syncCheckoutSuccess(
      { sessionId: input.sessionId },
      {
        authGateway: new FakeAuthGateway(input.user),
        subscriptionVersions: input.subscriptions,
        getClerkAuth: async () => ({
          userId: input.user.id,
          redirectToSignIn: () => {
            throw new CheckoutRedirect('/sign-in');
          },
        }),
        logger: input.logger,
        stripe: input.stripe,
        priceIds: input.priceIds,
        appUrl: input.appUrl,
        transaction: (fn) =>
          input.db.transaction((tx) =>
            fn({
              subscriptions: new DrizzleSubscriptionRepository(
                tx,
                input.priceIds,
              ),
              stripeCustomers: new DrizzleStripeCustomerRepository(tx),
            }),
          ),
      },
      (url) => {
        throw new CheckoutRedirect(url);
      },
    );
  } catch (error) {
    return (
      error instanceof CheckoutRedirect &&
      error.url.endsWith('/pricing?checkout=error')
    );
  }
  return false;
}

export function redirectForProviderContract(url: string): never {
  throw new CheckoutRedirect(url);
}
