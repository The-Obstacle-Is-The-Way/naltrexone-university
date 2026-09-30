import { describe, expect, it } from 'vitest';
import {
  isValidRenewalNoticeDeliveryKeyShape,
  type NewRenewalNoticeDelivery,
} from './renewal-notice-delivery';

const applicableAt = new Date('2026-11-04T12:00:00.000Z');

function delivery(
  overrides: Partial<NewRenewalNoticeDelivery>,
): NewRenewalNoticeDelivery {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    noticeKind: 'annual_reminder',
    consentRecordId: null,
    externalSubscriptionId: 'sub_notice',
    applicableAt,
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    providerIdempotencyKey:
      'renewal-notice:11111111-1111-4111-8111-111111111111',
    payloadSnapshot: '{}',
    payloadHash: 'a'.repeat(64),
    ...overrides,
  };
}

const acknowledgment = {
  noticeKind: 'acknowledgment',
  consentRecordId: '22222222-2222-4222-8222-222222222222',
  externalSubscriptionId: null,
  applicableAt: null,
} as const;

// An acknowledgment is keyed by its consent record; a scheduled notice by its
// subscription and renewal, as the database's key-shape check requires.
describe('isValidRenewalNoticeDeliveryKeyShape', () => {
  it('accepts an acknowledgment keyed by its consent record alone', () => {
    expect(isValidRenewalNoticeDeliveryKeyShape(delivery(acknowledgment))).toBe(
      true,
    );
  });

  it.each([
    ['no consent record', { consentRecordId: null }],
    ['a subscription', { externalSubscriptionId: 'sub_notice' }],
    ['a renewal date', { applicableAt }],
  ])('refuses an acknowledgment with %s', (_label, change) => {
    expect(
      isValidRenewalNoticeDeliveryKeyShape(
        delivery({ ...acknowledgment, ...change }),
      ),
    ).toBe(false);
  });

  it.each([
    'annual_reminder',
    'renewal_notice',
    'anniversary_reminder',
  ] as const)(
    'accepts a %s keyed by its subscription and renewal',
    (noticeKind) => {
      expect(
        isValidRenewalNoticeDeliveryKeyShape(delivery({ noticeKind })),
      ).toBe(true);
    },
  );

  it.each([
    ['a consent record', { consentRecordId: acknowledgment.consentRecordId }],
    ['no subscription', { externalSubscriptionId: null }],
    ['no renewal date', { applicableAt: null }],
  ])('refuses a scheduled notice with %s', (_label, change) => {
    expect(isValidRenewalNoticeDeliveryKeyShape(delivery(change))).toBe(false);
  });
});
