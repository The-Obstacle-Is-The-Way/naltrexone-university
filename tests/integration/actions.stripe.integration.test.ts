import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  createCheckoutSession,
  createPortalSession,
} from '@/src/adapters/controllers/billing-controller';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import {
  FakeAuthGateway,
  FakePaymentGateway,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  CreateCheckoutSessionUseCase,
  CreatePortalSessionUseCase,
} from '@/src/application/use-cases';
import type { User } from '@/src/domain/entities';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Did you forget to set it?',
  );
}

const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true';
const host = new URL(databaseUrl).hostname;
const isLocalhost =
  host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!allowNonLocal && !isLocalhost) {
  throw new Error(
    `Refusing to run integration tests against non-local DATABASE_URL host "${host}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`,
  );
}

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql, { schema });

const cleanup = {
  userIds: [] as string[],
};

async function createUser(): Promise<User & { clerkUserId: string }> {
  const email = `it-${randomUUID()}@example.com`;
  const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

  const [row] = await db
    .insert(schema.users)
    .values({ email, clerkUserId })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
      clerkUserId: schema.users.clerkUserId,
    });

  if (!row) throw new Error('Failed to insert user');

  cleanup.userIds.push(row.id);
  return row;
}

afterEach(async () => {
  if (cleanup.userIds.length > 0) {
    await db
      .delete(schema.users)
      .where(inArray(schema.users.id, cleanup.userIds));
  }
  cleanup.userIds.length = 0;
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('billing controllers (integration)', () => {
  it('creates a checkout session and persists a stripe customer mapping', async () => {
    const user = await createUser();
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test_1',
      checkoutUrl: 'https://stripe.test/checkout',
      portalUrl: 'https://stripe.test/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    const stripeCustomerRepository = new DrizzleStripeCustomerRepository(db);
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date('2026-02-01T00:00:00.000Z'),
    );
    const createCheckoutSessionUseCase = new CreateCheckoutSessionUseCase(
      stripeCustomerRepository,
      new FakeSubscriptionRepository(),
      paymentGateway,
      () => new Date('2026-02-01T00:00:00.000Z'),
    );
    const createPortalSessionUseCase = new CreatePortalSessionUseCase(
      stripeCustomerRepository,
      paymentGateway,
    );

    const result = await createCheckoutSession(
      { plan: 'monthly' },
      {
        authGateway: new FakeAuthGateway(user),
        createCheckoutSessionUseCase,
        createPortalSessionUseCase,
        idempotencyKeyRepository,
        rateLimiter: {
          limit: async () => ({
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          }),
        },
        getClerkUserId: async () => user.clerkUserId,
        appUrl: 'http://localhost:3000',
        now: () => new Date('2026-02-01T00:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: true,
      data: { url: 'https://stripe.test/checkout' },
    });
    expect(paymentGateway.customerInputs).toHaveLength(1);
    expect(paymentGateway.checkoutInputs).toHaveLength(1);

    const mapping = await stripeCustomerRepository.findByUserId(user.id);
    expect(mapping).toEqual({ stripeCustomerId: 'cus_test_1' });

    expect(paymentGateway.checkoutInputs[0]).toMatchObject({
      userId: user.id,
      stripeCustomerId: 'cus_test_1',
      plan: 'monthly',
    });
    expect(paymentGateway.checkoutInputs[0]?.cancelUrl).toContain(
      'checkout=cancel',
    );
    expect(paymentGateway.checkoutInputs[0]?.successUrl).toContain(
      '/checkout/success',
    );
    expect(paymentGateway.checkoutInputs[0]?.successUrl).toContain(
      'session_id=',
    );
  });

  it('creates a portal session for an existing stripe customer mapping', async () => {
    const user = await createUser();
    const paymentGateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test_2',
      checkoutUrl: 'https://stripe.test/checkout2',
      portalUrl: 'https://stripe.test/portal2',
      webhookResult: { eventId: 'evt_2', type: 'checkout.session.completed' },
    });

    const stripeCustomerRepository = new DrizzleStripeCustomerRepository(db);
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date('2026-02-01T00:00:00.000Z'),
    );
    const createCheckoutSessionUseCase = new CreateCheckoutSessionUseCase(
      stripeCustomerRepository,
      new FakeSubscriptionRepository(),
      paymentGateway,
      () => new Date('2026-02-01T00:00:00.000Z'),
    );
    const createPortalSessionUseCase = new CreatePortalSessionUseCase(
      stripeCustomerRepository,
      paymentGateway,
    );

    await createCheckoutSession(
      { plan: 'annual' },
      {
        authGateway: new FakeAuthGateway(user),
        createCheckoutSessionUseCase,
        createPortalSessionUseCase,
        idempotencyKeyRepository,
        rateLimiter: {
          limit: async () => ({
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          }),
        },
        getClerkUserId: async () => user.clerkUserId,
        appUrl: 'http://localhost:3000',
        now: () => new Date('2026-02-01T00:00:00.000Z'),
      },
    );

    const result = await createPortalSession(
      {},
      {
        authGateway: new FakeAuthGateway(user),
        createCheckoutSessionUseCase,
        createPortalSessionUseCase,
        idempotencyKeyRepository,
        rateLimiter: {
          limit: async () => ({
            success: true,
            limit: 10,
            remaining: 9,
            retryAfterSeconds: 0,
          }),
        },
        getClerkUserId: async () => user.clerkUserId,
        appUrl: 'http://localhost:3000',
        now: () => new Date('2026-02-01T00:00:00.000Z'),
      },
    );

    expect(result).toEqual({
      ok: true,
      data: { url: 'https://stripe.test/portal2' },
    });
    expect(paymentGateway.portalInputs).toHaveLength(1);
    expect(paymentGateway.portalInputs[0]).toMatchObject({
      stripeCustomerId: 'cus_test_2',
    });
    expect(paymentGateway.portalInputs[0]?.returnUrl).toBe(
      'http://localhost:3000/app/billing',
    );
  });
});
