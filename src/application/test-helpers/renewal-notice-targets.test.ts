import { describe, expect, it } from 'vitest';
import { createMatchingRenewalNoticeTargets } from './renewal-notice-targets';

describe('createMatchingRenewalNoticeTargets', () => {
  it('pairs each active annual subscription with the account the notices are addressed to', async () => {
    const renewalAt = new Date('2026-09-06T12:00:00.000Z');

    const targets = await createMatchingRenewalNoticeTargets({
      externalSubscriptionIds: ['sub_annual_123', 'sub_annual_456'],
      renewalAt,
      destination: 'subscriber@example.com',
    });

    const subscription =
      await targets.subscriptions.findByExternalSubscriptionId(
        'sub_annual_123',
      );
    expect(subscription).toMatchObject({
      plan: 'annual',
      status: 'active',
      currentPeriodEnd: renewalAt,
      cancelAtPeriodEnd: false,
    });
    await expect(
      targets.users.findById(subscription?.userId ?? ''),
    ).resolves.toMatchObject({ email: 'subscriber@example.com' });
    await expect(
      targets.subscriptions.findByExternalSubscriptionId('sub_annual_456'),
    ).resolves.toMatchObject({ userId: subscription?.userId });
  });
});
