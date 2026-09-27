import type { RenewalNoticeTargets } from '@/src/application/use-cases/dispatch-renewal-notice-delivery';
import { createSubscription } from '@/src/domain/test-helpers';
import { FakeSubscriptionRepository, FakeUserRepository } from './fakes';

// Notice targets that still match scheduled renewal notices (DEBT-414 F07):
// one active annual subscription per external id, each renewing at renewalAt
// and owned by the account whose email is the notices' destination.
export async function createMatchingRenewalNoticeTargets(input: {
  externalSubscriptionIds: readonly string[];
  renewalAt: Date;
  destination: string;
}): Promise<RenewalNoticeTargets> {
  const users = new FakeUserRepository();
  const account = await users.upsertByClerkId(
    'clerk_renewal_notice_recipient',
    input.destination,
  );
  const subscriptions = new FakeSubscriptionRepository(
    input.externalSubscriptionIds.map((externalSubscriptionId) => ({
      subscription: createSubscription({
        userId: account.id,
        plan: 'annual',
        status: 'active',
        currentPeriodEnd: input.renewalAt,
        cancelAtPeriodEnd: false,
      }),
      externalSubscriptionId,
    })),
  );
  return { subscriptions, users };
}
