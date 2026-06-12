import { describe, expect, it } from 'vitest';
import type { SubscriptionUpsertInput } from '@/src/application/ports/repositories';
import { FakeSubscriptionRepository } from './fake-subscription-repository';

function makeUpsertInput(
  overrides: Partial<SubscriptionUpsertInput> = {},
): SubscriptionUpsertInput {
  return {
    userId: 'user_1',
    externalSubscriptionId: 'sub_123',
    plan: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe('FakeSubscriptionRepository', () => {
  describe('upsert', () => {
    it('stores a subscription and supports lookup by userId', async () => {
      const repo = new FakeSubscriptionRepository();

      await repo.upsert(makeUpsertInput());

      await expect(repo.findByUserId('user_1')).resolves.toMatchObject({
        userId: 'user_1',
        plan: 'monthly',
        status: 'active',
      });
    });

    it('stores a subscription and supports lookup by externalSubscriptionId', async () => {
      const repo = new FakeSubscriptionRepository();

      await repo.upsert(makeUpsertInput());

      await expect(
        repo.findByExternalSubscriptionId('sub_123'),
      ).resolves.toMatchObject({
        userId: 'user_1',
      });
    });

    it('replaces externalSubscriptionId for the same user on re-upsert', async () => {
      const repo = new FakeSubscriptionRepository();

      await repo.upsert(makeUpsertInput());
      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_456',
          plan: 'annual',
          status: 'active',
          currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
          cancelAtPeriodEnd: true,
        }),
      );

      await expect(
        repo.findByExternalSubscriptionId('sub_123'),
      ).resolves.toBeNull();
      await expect(
        repo.findByExternalSubscriptionId('sub_456'),
      ).resolves.toMatchObject({
        userId: 'user_1',
      });
    });

    it('does not replace a current entitled row with a superseded terminal subscription', async () => {
      const repo = new FakeSubscriptionRepository();

      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_current',
          status: 'active',
          currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        }),
      );
      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_superseded',
          status: 'canceled',
          currentPeriodEnd: new Date('2026-01-31T00:00:00.000Z'),
        }),
      );

      await expect(
        repo.findByExternalSubscriptionId('sub_current'),
      ).resolves.toMatchObject({
        userId: 'user_1',
        status: 'active',
      });
      await expect(
        repo.findByExternalSubscriptionId('sub_superseded'),
      ).resolves.toBeNull();
    });

    it('keeps legitimate same-subscription terminal transitions', async () => {
      const repo = new FakeSubscriptionRepository();

      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_current',
          status: 'active',
          currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        }),
      );
      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_current',
          status: 'canceled',
          currentPeriodEnd: new Date('2026-01-31T00:00:00.000Z'),
        }),
      );

      await expect(
        repo.findByExternalSubscriptionId('sub_current'),
      ).resolves.toMatchObject({
        userId: 'user_1',
        status: 'canceled',
      });
    });

    it('uses the injected clock when deciding whether the stored row is current', async () => {
      const now = new Date('2026-06-12T00:00:00.000Z');
      const repo = new FakeSubscriptionRepository([], () => now);

      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_current',
          status: 'active',
          currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
        }),
      );
      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_superseded',
          status: 'canceled',
          currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
        }),
      );

      await expect(repo.findByUserId('user_1')).resolves.toMatchObject({
        status: 'active',
        currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
      });
    });

    it('applies the guard to constructor-seeded rows with external subscription ids', async () => {
      const now = new Date('2026-06-12T00:00:00.000Z');
      const repo = new FakeSubscriptionRepository(
        [
          {
            subscription: {
              id: 'sub-row-1',
              userId: 'user_1',
              plan: 'monthly',
              status: 'active',
              currentPeriodEnd: new Date('2026-06-13T00:00:00.000Z'),
              cancelAtPeriodEnd: false,
              createdAt: now,
              updatedAt: now,
            },
            externalSubscriptionId: 'sub_current',
          },
        ],
        () => now,
      );

      await repo.upsert(
        makeUpsertInput({
          externalSubscriptionId: 'sub_superseded',
          status: 'canceled',
          currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
        }),
      );

      await expect(
        repo.findByExternalSubscriptionId('sub_current'),
      ).resolves.toMatchObject({
        userId: 'user_1',
        status: 'active',
      });
      await expect(
        repo.findByExternalSubscriptionId('sub_superseded'),
      ).resolves.toBeNull();
    });
  });

  it('throws CONFLICT when an externalSubscriptionId is reused for a different user', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert(makeUpsertInput());

    await expect(
      repo.upsert(
        makeUpsertInput({
          userId: 'user_2',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External subscription id is already mapped to a different user',
    });
  });

  it('restores repository state from a snapshot', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert(makeUpsertInput());

    const snapshot = repo.snapshot();

    await repo.upsert(
      makeUpsertInput({
        externalSubscriptionId: 'sub_456',
        plan: 'annual',
        status: 'canceled',
        currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
        cancelAtPeriodEnd: true,
      }),
    );

    repo.restore(snapshot);

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });
    await expect(
      repo.findByExternalSubscriptionId('sub_456'),
    ).resolves.toBeNull();
  });
});
