import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import type { TrialPaymentMethodSetupOperationRepository } from '@/src/application/ports/repositories';
import { FakeTrialPaymentMethodSetupOperationRepository } from '@/src/application/test-helpers/fakes';
import { seedTrialSetupOperation } from '@/src/application/test-helpers/trial-payment-method-setup-operations';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

/**
 * Fake-fidelity contract (BUG-308): the same scenario table runs against the
 * fake and the real Postgres adapter. A trial has a saved card once an
 * add-card operation for that learner and that Stripe subscription has set
 * the card as the subscription's default payment method.
 */
type ContractHarness = {
  repo: TrialPaymentMethodSetupOperationRepository;
  newUserId(): Promise<string>;
};

function createFakeHarness(): ContractHarness {
  return {
    repo: new FakeTrialPaymentMethodSetupOperationRepository(),
    newUserId: async () => randomUUID(),
  };
}

function createRealHarness(): ContractHarness {
  return {
    repo: new DrizzleTrialPaymentMethodSetupOperationRepository(db),
    newUserId: async () => (await createUser(db, cleanup)).id,
  };
}

const SUBSCRIPTION = 'sub_contract_current';

const scenarios: {
  name: string;
  seed: (
    repo: TrialPaymentMethodSetupOperationRepository,
    ids: { userId: string; otherUserId: string },
  ) => Promise<void>;
  expected: boolean;
}[] = [
  {
    name: 'no add-card operation',
    seed: async () => undefined,
    expected: false,
  },
  {
    name: 'a pending operation, before Stripe completes',
    seed: (repo, { userId }) =>
      seedTrialSetupOperation(repo, {
        userId,
        stripeSubscriptionId: SUBSCRIPTION,
        stage: 'pending',
      }),
    expected: false,
  },
  {
    name: 'a card attached but not yet the default',
    seed: (repo, { userId }) =>
      seedTrialSetupOperation(repo, {
        userId,
        stripeSubscriptionId: SUBSCRIPTION,
        stage: 'attached',
      }),
    expected: false,
  },
  {
    name: 'a card set as the default, before completion is recorded',
    seed: (repo, { userId }) =>
      seedTrialSetupOperation(repo, {
        userId,
        stripeSubscriptionId: SUBSCRIPTION,
        stage: 'defaultSet',
      }),
    expected: true,
  },
  {
    name: 'a completed operation',
    seed: (repo, { userId }) =>
      seedTrialSetupOperation(repo, {
        userId,
        stripeSubscriptionId: SUBSCRIPTION,
        stage: 'completed',
      }),
    expected: true,
  },
  {
    name: "a completed operation for the learner's earlier subscription",
    seed: (repo, { userId }) =>
      seedTrialSetupOperation(repo, {
        userId,
        stripeSubscriptionId: 'sub_contract_earlier',
        stage: 'completed',
      }),
    expected: false,
  },
  {
    name: "another learner's completed operation on the same subscription id",
    seed: (repo, { otherUserId }) =>
      seedTrialSetupOperation(repo, {
        userId: otherUserId,
        stripeSubscriptionId: SUBSCRIPTION,
        stage: 'completed',
      }),
    expected: false,
  },
];

describe.each([
  ['fake', createFakeHarness],
  ['Postgres', createRealHarness],
] as const)('trial saved-card contract (%s)', (_name, createHarness) => {
  it.each(scenarios)('$name → $expected', async ({ seed, expected }) => {
    const harness = createHarness();
    const userId = await harness.newUserId();
    const otherUserId = await harness.newUserId();
    await seed(harness.repo, { userId, otherUserId });

    await expect(
      harness.repo.hasSubscriptionDefaultSet({
        userId,
        stripeSubscriptionId: SUBSCRIPTION,
      }),
    ).resolves.toBe(expected);
  });
});
