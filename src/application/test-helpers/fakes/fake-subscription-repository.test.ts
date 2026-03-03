import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeSubscriptionRepository } from './fake-subscription-repository';

describe('FakeSubscriptionRepository', () => {
  it('upserts subscriptions and supports lookup by externalSubscriptionId', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(repo.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_456',
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
    });

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toBeNull();
    await expect(
      repo.findByExternalSubscriptionId('sub_456'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });
  });

  it('throws CONFLICT when an externalSubscriptionId is reused for a different user', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: 'user_2',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'External subscription id is already mapped to a different user',
      ),
    );
  });

  it('restores repository state from a snapshot', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    const snapshot = repo.snapshot();

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_456',
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
    });

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
