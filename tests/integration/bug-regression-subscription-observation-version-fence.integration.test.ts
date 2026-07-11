import { randomUUID } from 'node:crypto';
import { afterAll, afterEach } from 'vitest';
import { DrizzleSubscriptionRepository } from '@/src/adapters/repositories/drizzle-subscription-repository';
import { runSubscriptionObservationVersionContract } from '@/tests/shared/subscription-observation-version-contract';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const priceIds = {
  monthly: 'price_test_monthly',
  annual: 'price_test_annual',
} as const;

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

runSubscriptionObservationVersionContract(
  'DrizzleSubscriptionRepository',
  async () => {
    const user = await createUser(db, cleanup);

    return {
      repository: new DrizzleSubscriptionRepository(db, priceIds) as never,
      userId: user.id,
      externalSubscriptionId: (label: string) =>
        `sub_${label}_${randomUUID().replaceAll('-', '')}`,
    };
  },
);
