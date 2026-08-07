import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
} from '@/src/application/test-helpers/fakes';
import type {
  StripeWebhookDeps,
  StripeWebhookTransaction,
} from '../stripe-webhook-controller';

export function createStripeWebhookRenewalAcknowledgmentTestDeps(): {
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
  return {
    webhook: {
      appUrl: 'https://addictionboards.com',
      sha256Hasher,
      dispatchRenewalNoticeDelivery: {
        execute: async () => ({ outcome: 'claim_lost', delivery: null }),
      },
    },
    transaction: {
      renewalNoticeDeliveries: new FakeRenewalNoticeDeliveryRepository(
        () => new Date('2026-08-07T12:00:00.000Z'),
        sha256Hasher,
      ),
      users: {
        findById: async (id) => ({
          id,
          email: 'subscriber@example.com',
          createdAt: new Date('2026-08-07T12:00:00.000Z'),
          updatedAt: new Date('2026-08-07T12:00:00.000Z'),
        }),
      },
    },
  };
}
