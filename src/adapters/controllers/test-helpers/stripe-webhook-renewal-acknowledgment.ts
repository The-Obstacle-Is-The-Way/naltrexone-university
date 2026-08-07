import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
} from '@/src/application/test-helpers/fakes';
import type {
  StripeWebhookDeps,
  StripeWebhookTransaction,
} from '../stripe-webhook-controller';

export function createStripeWebhookRenewalAcknowledgmentTestDeps(input?: {
  findUserById?: StripeWebhookTransaction['users']['findById'];
  dispatchRenewalNoticeDelivery?: StripeWebhookDeps['dispatchRenewalNoticeDelivery'];
}): {
  createRenewalNoticeDeliveries: () => FakeRenewalNoticeDeliveryRepository;
  renewalNoticeDeliveries: FakeRenewalNoticeDeliveryRepository;
  webhook: Pick<
    StripeWebhookDeps,
    'appUrl' | 'sha256Hasher' | 'dispatchRenewalNoticeDelivery'
  >;
  transaction: Pick<
    StripeWebhookTransaction,
    'renewalNoticeDeliveries' | 'users'
  >;
} {
  const sha256Hasher = new FakeSha256Hasher();
  const createRenewalNoticeDeliveries = () =>
    new FakeRenewalNoticeDeliveryRepository(
      () => new Date('2026-08-07T12:00:00.000Z'),
      sha256Hasher,
    );
  const renewalNoticeDeliveries = createRenewalNoticeDeliveries();
  return {
    createRenewalNoticeDeliveries,
    renewalNoticeDeliveries,
    webhook: {
      appUrl: 'https://addictionboards.com',
      sha256Hasher,
      dispatchRenewalNoticeDelivery: input?.dispatchRenewalNoticeDelivery ?? {
        execute: async () => ({ outcome: 'claim_lost', delivery: null }),
      },
    },
    transaction: {
      renewalNoticeDeliveries,
      users: {
        findById:
          input?.findUserById ??
          (async (id) => ({
            id,
            email: 'subscriber@example.com',
            createdAt: new Date('2026-08-07T12:00:00.000Z'),
            updatedAt: new Date('2026-08-07T12:00:00.000Z'),
          })),
      },
    },
  };
}
