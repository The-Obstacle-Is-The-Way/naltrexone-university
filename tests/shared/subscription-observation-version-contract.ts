import { describe, expect, it } from 'vitest';
import type {
  SubscriptionRepository,
  SubscriptionUpsertInput,
} from '@/src/application/ports/repositories';

export const SUBSCRIPTION_REPOSITORY_CONTRACT_METHODS = [
  'findByUserId',
  'findExternalSubscriptionIdByUserId',
  'findObservationVersionByUserId',
  'findByExternalSubscriptionId',
  'upsert',
] as const satisfies readonly (keyof SubscriptionRepository)[];

type MissingSubscriptionRepositoryContractMethod = Exclude<
  keyof SubscriptionRepository,
  (typeof SUBSCRIPTION_REPOSITORY_CONTRACT_METHODS)[number]
>;

const allSubscriptionRepositoryMethodsAreNamed: MissingSubscriptionRepositoryContractMethod extends never
  ? true
  : false = true;
void allSubscriptionRepositoryMethodsAreNamed;

export type SubscriptionObservationVersionContractRepository =
  SubscriptionRepository;

export type SubscriptionObservationVersionContractHarness = {
  repository: SubscriptionObservationVersionContractRepository;
  userId: string;
  externalSubscriptionId(label: string): string;
};

type ContractScenario = {
  name: string;
  run(harness: SubscriptionObservationVersionContractHarness): Promise<void>;
};

function createUpsertInput(
  harness: SubscriptionObservationVersionContractHarness,
  externalSubscriptionId: string,
  expectedVersion: number | null,
  overrides: Partial<SubscriptionUpsertInput> = {},
): SubscriptionUpsertInput {
  return {
    userId: harness.userId,
    externalSubscriptionId,
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    expectedVersion,
    ...overrides,
  };
}

export const subscriptionObservationVersionContractScenarios: readonly ContractScenario[] =
  [
    {
      name: 'starts a first persisted observation at version 1',
      async run(harness) {
        const externalSubscriptionId = harness.externalSubscriptionId('insert');

        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBeNull();
        await expect(
          harness.repository.upsert(
            createUpsertInput(harness, externalSubscriptionId, null),
          ),
        ).resolves.toEqual({ persisted: true });
        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBe(1);
      },
    },
    {
      name: 'finds the external subscription id mapped to a user',
      async run(harness) {
        const externalSubscriptionId =
          harness.externalSubscriptionId('lookup_by_user');

        await expect(
          harness.repository.findExternalSubscriptionIdByUserId(harness.userId),
        ).resolves.toBeNull();
        await harness.repository.upsert(
          createUpsertInput(harness, externalSubscriptionId, null),
        );

        await expect(
          harness.repository.findExternalSubscriptionIdByUserId(harness.userId),
        ).resolves.toBe(externalSubscriptionId);
      },
    },
    {
      name: 'finds a subscription by its external subscription id',
      async run(harness) {
        const externalSubscriptionId =
          harness.externalSubscriptionId('lookup_by_external');

        await expect(
          harness.repository.findByExternalSubscriptionId(
            externalSubscriptionId,
          ),
        ).resolves.toBeNull();
        await harness.repository.upsert(
          createUpsertInput(harness, externalSubscriptionId, null),
        );

        await expect(
          harness.repository.findByExternalSubscriptionId(
            externalSubscriptionId,
          ),
        ).resolves.toMatchObject({
          userId: harness.userId,
          plan: 'monthly',
          status: 'active',
        });
      },
    },
    {
      name: 'increments the observation version on update',
      async run(harness) {
        const externalSubscriptionId = harness.externalSubscriptionId('update');
        await harness.repository.upsert(
          createUpsertInput(harness, externalSubscriptionId, null),
        );

        await expect(
          harness.repository.upsert(
            createUpsertInput(harness, externalSubscriptionId, 1, {
              plan: 'annual',
              status: 'pastDue',
              currentPeriodEnd: new Date('2031-01-01T00:00:00.000Z'),
              cancelAtPeriodEnd: true,
            }),
          ),
        ).resolves.toEqual({ persisted: true });
        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBe(2);
        await expect(
          harness.repository.findByUserId(harness.userId),
        ).resolves.toMatchObject({
          plan: 'annual',
          status: 'pastDue',
          currentPeriodEnd: new Date('2031-01-01T00:00:00.000Z'),
          cancelAtPeriodEnd: true,
        });
      },
    },
    {
      name: 'increments the observation version on a successful no-op write',
      async run(harness) {
        const externalSubscriptionId = harness.externalSubscriptionId('no_op');
        const input = createUpsertInput(harness, externalSubscriptionId, null);
        await harness.repository.upsert(input);

        await expect(
          harness.repository.upsert({ ...input, expectedVersion: 1 }),
        ).resolves.toEqual({ persisted: true });
        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBe(2);
      },
    },
    {
      name: 'keeps the version unchanged when the write guard rejects',
      async run(harness) {
        const currentSubscriptionId =
          harness.externalSubscriptionId('guard_current');
        await harness.repository.upsert(
          createUpsertInput(harness, currentSubscriptionId, null),
        );

        const supersededSubscriptionId =
          harness.externalSubscriptionId('guard_superseded');
        await expect(
          harness.repository.upsert(
            createUpsertInput(harness, supersededSubscriptionId, 1, {
              status: 'canceled',
              currentPeriodEnd: new Date('2025-01-01T00:00:00.000Z'),
            }),
          ),
        ).resolves.toMatchObject({
          persisted: false,
          reason: 'write_guard_rejected',
          current: {
            userId: harness.userId,
            status: 'active',
          },
        });
        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBe(1);
      },
    },
    {
      name: 'rejects a stale expected version without mutating state',
      async run(harness) {
        const externalSubscriptionId = harness.externalSubscriptionId('stale');
        await harness.repository.upsert(
          createUpsertInput(harness, externalSubscriptionId, null),
        );
        await harness.repository.upsert(
          createUpsertInput(harness, externalSubscriptionId, 1, {
            currentPeriodEnd: new Date('2031-01-01T00:00:00.000Z'),
          }),
        );

        await expect(
          harness.repository.upsert(
            createUpsertInput(harness, externalSubscriptionId, 1, {
              status: 'canceled',
              currentPeriodEnd: new Date('2025-01-01T00:00:00.000Z'),
            }),
          ),
        ).resolves.toEqual({
          persisted: false,
          reason: 'version_conflict',
        });
        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBe(2);
        await expect(
          harness.repository.findByUserId(harness.userId),
        ).resolves.toMatchObject({
          status: 'active',
          currentPeriodEnd: new Date('2031-01-01T00:00:00.000Z'),
        });
      },
    },
    {
      name: 'reports a version conflict before consulting the write guard',
      async run(harness) {
        const currentSubscriptionId =
          harness.externalSubscriptionId('ordering_current');
        await harness.repository.upsert(
          createUpsertInput(harness, currentSubscriptionId, null),
        );

        await expect(
          harness.repository.upsert(
            createUpsertInput(
              harness,
              harness.externalSubscriptionId('ordering_superseded'),
              0,
              {
                status: 'canceled',
                currentPeriodEnd: new Date('2025-01-01T00:00:00.000Z'),
              },
            ),
          ),
        ).resolves.toEqual({
          persisted: false,
          reason: 'version_conflict',
        });
        await expect(
          harness.repository.findObservationVersionByUserId(harness.userId),
        ).resolves.toBe(1);
      },
    },
  ];

export function runSubscriptionObservationVersionContract(
  adapterName: string,
  createHarness: () => Promise<SubscriptionObservationVersionContractHarness>,
): void {
  describe(`${adapterName} subscription observation-version contract`, () => {
    it.each(subscriptionObservationVersionContractScenarios)(
      '$name',
      async (scenario) => {
        await scenario.run(await createHarness());
      },
    );
  });
}
