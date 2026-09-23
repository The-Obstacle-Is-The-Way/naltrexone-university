import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleStripeCustomerRepository } from '@/src/adapters/repositories/drizzle-stripe-customer-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

// Behavior twins for the retired call-chain units; the shared
// stripe-repositories twin already proves the idempotent upsert and both
// CONFLICT paths.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleStripeCustomerRepository', () => {
  it('returns null from findByUserId when the user has no mapping', async () => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzleStripeCustomerRepository(db);

    await expect(repo.findByUserId(user.id)).resolves.toBeNull();
  });

  it('replaces the mapping when conflictStrategy is authoritative', async () => {
    const user = await createUser(db, cleanup);
    const repo = new DrizzleStripeCustomerRepository(db);
    await repo.insert(user.id, 'cus_original');

    await expect(
      repo.insert(user.id, 'cus_replacement', {
        conflictStrategy: 'authoritative',
      }),
    ).resolves.toBeUndefined();
    await expect(repo.findByUserId(user.id)).resolves.toEqual({
      stripeCustomerId: 'cus_replacement',
    });
  });

  it('names the strict-conflict and foreign-mapping errors distinctly', async () => {
    const user = await createUser(db, cleanup);
    const otherUser = await createUser(db, cleanup);
    const repo = new DrizzleStripeCustomerRepository(db);
    await repo.insert(user.id, 'cus_owned');

    await expect(repo.insert(user.id, 'cus_other')).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'Stripe customer already exists with a different stripeCustomerId',
    });
    await expect(repo.insert(otherUser.id, 'cus_owned')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Stripe customer id is already mapped to a different user',
    });
  });
});
