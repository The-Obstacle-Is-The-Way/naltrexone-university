import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { stripeEvents } from '@/db/schema';
import { createContainer } from '@/lib/container';
import { env } from '@/lib/env';
import {
  DrizzleRenewalConsentRecordRepository,
  DrizzleStripeCustomerRepository,
  DrizzleStripeEventRepository,
  DrizzleSubscriptionRepository,
} from '@/src/adapters/repositories';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('container webhook transaction wiring', () => {
  it('uses overridden repository factories in one real transaction and rolls back a failed callback', async () => {
    const transaction = vi.spyOn(db, 'transaction');
    // These observers construct real adapters; no SQL result or transaction
    // behavior is supplied by a test double.
    const createStripeEventRepository = vi.fn(
      (currentDb: DrizzleDb = db) =>
        new DrizzleStripeEventRepository(currentDb),
    );
    const createSubscriptionRepository = vi.fn(
      (currentDb: DrizzleDb = db) =>
        new DrizzleSubscriptionRepository(currentDb, {
          monthly: env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
          annual: env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
        }),
    );
    const createStripeCustomerRepository = vi.fn(
      (currentDb: DrizzleDb = db) =>
        new DrizzleStripeCustomerRepository(currentDb),
    );
    const createRenewalConsentRecordRepository = vi.fn(
      (currentDb: DrizzleDb = db) =>
        new DrizzleRenewalConsentRecordRepository(currentDb),
    );
    const container = createContainer({
      primitives: { db },
      repositories: {
        createStripeEventRepository,
        createSubscriptionRepository,
        createStripeCustomerRepository,
        createRenewalConsentRecordRepository,
      },
    });
    const deps = container.createStripeWebhookDeps();
    expect(
      deps.subscriptionVersions ===
        createSubscriptionRepository.mock.results[0]?.value,
      'the outside-transaction version repository comes from its override',
    ).toBe(true);
    const eventId = randomUUID();
    cleanup.stripeEventIds.push(eventId);
    const failure = new Error('Injected webhook callback failure');

    await expect(
      deps.transaction(async (repositories) => {
        const transactionDb = createStripeEventRepository.mock.calls[0]?.[0];
        expect(transactionDb).toBeDefined();
        // Compare identities as booleans so failures never serialize a DB
        // client (including its connection configuration) into the test log.
        expect(transactionDb === db, 'a transaction, not the pool').toBe(false);
        expect(createStripeEventRepository).toHaveBeenCalledTimes(1);
        expect(createSubscriptionRepository).toHaveBeenCalledTimes(2);
        expect(
          (createSubscriptionRepository.mock.calls[0]?.[0] ?? db) === db,
          'version reads use the outside-transaction pool',
        ).toBe(true);
        expect(
          createSubscriptionRepository.mock.calls[1]?.[0] === transactionDb,
          'subscriptions use the callback transaction',
        ).toBe(true);
        expect(
          createStripeCustomerRepository.mock.calls[0]?.[0] === transactionDb,
          'customers use the callback transaction',
        ).toBe(true);
        expect(
          createRenewalConsentRecordRepository.mock.calls[0]?.[0] ===
            transactionDb,
          'consents use the callback transaction',
        ).toBe(true);
        expect(
          repositories.stripeEvents ===
            createStripeEventRepository.mock.results[0]?.value,
          'events come from the override',
        ).toBe(true);
        expect(
          repositories.subscriptions ===
            createSubscriptionRepository.mock.results[1]?.value,
          'subscriptions come from the override',
        ).toBe(true);
        expect(
          repositories.stripeCustomers ===
            createStripeCustomerRepository.mock.results[0]?.value,
          'customers come from the override',
        ).toBe(true);
        expect(
          repositories.renewalConsentRecords ===
            createRenewalConsentRecordRepository.mock.results[0]?.value,
          'consents come from the override',
        ).toBe(true);
        await expect(
          repositories.stripeEvents.claim(eventId, 'container.rollback'),
        ).resolves.toBe(true);
        await expect(repositories.stripeEvents.peek(eventId)).resolves.toEqual({
          processedAt: null,
          error: null,
        });
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(
      db.query.stripeEvents.findFirst({ where: eq(stripeEvents.id, eventId) }),
    ).resolves.toBeUndefined();
  });
});
