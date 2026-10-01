import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { parseTransactionalEmailPayloadSnapshot } from '@/src/application/shared/transactional-email-payload';
import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
} from '@/src/application/test-helpers/fakes';
import type { RenewalConsentRecord } from '@/src/domain/entities';
import { SendRenewalAcknowledgmentUseCase } from './send-renewal-acknowledgment';

const now = new Date('2026-08-07T12:00:00.000Z');
const consent: RenewalConsentRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  consumerReference:
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  externalCustomerId: 'cus_123',
  externalSubscriptionId: 'sub_123',
  checkoutSessionId: 'cs_123',
  setupSessionId: null,
  applicationSourceId: null,
  plan: 'monthly',
  amountCents: 2900,
  currency: 'usd',
  frequency: 'month',
  trialEndsAt: new Date('2026-08-14T12:00:00.000Z'),
  cancellationDeadline: new Date('2026-08-14T12:00:00.000Z'),
  cancellationMethod:
    'Cancel on the Billing page in the app or email support@addictionboards.com.',
  disclosureSnapshot: 'Your subscription renews monthly at $29 until canceled.',
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
  consentSource: 'stripe_checkout',
  acceptedAt: new Date('2026-08-07T11:55:00.000Z'),
  consentKind: 'initial_offer',
  priorAmountCents: null,
  proposedAmountCents: null,
  effectiveRenewalAt: null,
  subscriptionTerminatedAt: null,
  retainUntil: new Date('2029-08-07T11:55:00.000Z'),
  createdAt: now,
  updatedAt: now,
};

function createHarness() {
  const hasher = new FakeSha256Hasher();
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  let sequence = 0;
  const useCase = new SendRenewalAcknowledgmentUseCase(
    repository,
    hasher,
    'https://addictionboards.com',
    () => `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}`,
  );
  return { hasher, repository, useCase };
}

async function sentPayload(input: {
  consent: RenewalConsentRecord;
  destination: string;
}) {
  const { hasher, useCase } = createHarness();
  const delivery = await useCase.execute(input);
  return parseTransactionalEmailPayloadSnapshot(
    {
      snapshot: delivery.payloadSnapshot,
      hash: delivery.payloadHash,
      destination: delivery.destination,
    },
    hasher,
  );
}

describe('SendRenewalAcknowledgmentUseCase', () => {
  it('queues immutable acknowledgment content for every accepted term', async () => {
    const { hasher, repository, useCase } = createHarness();

    const delivery = await useCase.execute({
      consent,
      destination: 'subscriber@example.com',
    });
    const payload = parseTransactionalEmailPayloadSnapshot(
      {
        snapshot: delivery.payloadSnapshot,
        hash: delivery.payloadHash,
        destination: delivery.destination,
      },
      hasher,
    );

    expect(delivery).toMatchObject({
      noticeKind: 'acknowledgment',
      consentRecordId: consent.id,
      externalSubscriptionId: null,
      applicableAt: null,
      disclosureVersion: consent.disclosureVersion,
      destination: 'subscriber@example.com',
      status: 'queued',
      attemptCount: 0,
    });
    expect(delivery.providerIdempotencyKey).toBe(
      `renewal-notice/${delivery.id}`,
    );
    expect(payload.to).toBe('subscriber@example.com');
    expect(payload.replyTo).toBe('support@addictionboards.com');
    expect(payload.text).toContain(consent.disclosureSnapshot);
    expect(payload.text).toContain('$29.00 USD every month');
    expect(payload.text).toContain('August 14, 2026');
    // DEBT-414 F06: deadlines carry their time and zone, not a UTC date.
    expect(payload.text).toContain(
      'Trial ends: August 14, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT).',
    );
    expect(payload.text).toContain(
      'Cancellation deadline: August 14, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT).',
    );
    expect(payload.text).toContain(consent.cancellationMethod);
    // DEBT-414 F15: the policy itself, for every consent, including ones
    // accepted before the consent copy stated it.
    expect(payload.text).toContain(
      'Cancellation and refunds: Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.',
    );
    expect(payload.text).toContain('John H. Jung, MD, MS');
    expect(payload.text).toContain('support@addictionboards.com');
    expect(payload.text).toContain('https://addictionboards.com/terms');
    expect(payload.text).toContain('https://addictionboards.com/privacy');
    expect(repository.records).toHaveLength(1);
  });

  it('reuses one acknowledgment row when the same consent is replayed', async () => {
    const { repository, useCase } = createHarness();

    const first = await useCase.execute({
      consent,
      destination: 'subscriber@example.com',
    });
    const replay = await useCase.execute({
      consent,
      destination: 'subscriber@example.com',
    });

    expect(replay).toEqual(first);
    expect(repository.records).toHaveLength(1);
  });

  it('rejects a missing destination before creating a delivery row', async () => {
    const { repository, useCase } = createHarness();

    await expect(
      useCase.execute({ consent, destination: '   ' }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Renewal acknowledgment requires a destination',
      ),
    );
    expect(repository.records).toEqual([]);
  });

  // The acknowledgment is the subscriber's written record of the terms they
  // accepted, so its exact content is the behavior. Like a scheduled notice
  // (DEBT-414 F06), it links the online cancellation route, support mail,
  // Terms and Privacy as anchors in HTML and as URLs in text.
  it('sends the exact acknowledgment text and HTML', async () => {
    await expect(
      sentPayload({ consent, destination: 'subscriber@example.com' }),
    ).resolves.toEqual({
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: 'subscriber@example.com',
      replyTo: 'support@addictionboards.com',
      subject: 'Your Addiction Boards subscription terms',
      text: [
        'Thank you for confirming your Addiction Boards subscription terms.',
        'Accepted renewal terms: Your subscription renews monthly at $29 until canceled.',
        'Price and frequency: $29.00 USD every month.',
        'Trial ends: August 14, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT).',
        'Cancellation deadline: August 14, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT).',
        'How to cancel: Cancel on the Billing page in the app or email support@addictionboards.com.',
        'Cancel online on the Billing page: https://addictionboards.com/app/billing',
        'Or email support@addictionboards.com from the email address on your account.',
        'Cancellation and refunds: Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.',
        'Accepted: 2026-08-07T11:55:00.000Z.',
        'Terms version: 2026-08-05.',
        'Business contact: John H. Jung, MD, MS, sole proprietor — support@addictionboards.com.',
        'Terms: https://addictionboards.com/terms',
        'Privacy: https://addictionboards.com/privacy',
      ].join('\n'),
      html: [
        '<p>Thank you for confirming your Addiction Boards subscription terms.</p>',
        '<p>Accepted renewal terms: Your subscription renews monthly at $29 until canceled.</p>',
        '<p>Price and frequency: $29.00 USD every month.</p>',
        '<p>Trial ends: August 14, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT).</p>',
        '<p>Cancellation deadline: August 14, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT).</p>',
        '<p>How to cancel: Cancel on the Billing page in the app or email support@addictionboards.com.</p>',
        '<p>Cancel online on the Billing page: <a href="https://addictionboards.com/app/billing">https://addictionboards.com/app/billing</a></p>',
        '<p>Or email <a href="mailto:support@addictionboards.com">support@addictionboards.com</a> from the email address on your account.</p>',
        '<p>Cancellation and refunds: Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.</p>',
        '<p>Accepted: 2026-08-07T11:55:00.000Z.</p>',
        '<p>Terms version: 2026-08-05.</p>',
        '<p>Business contact: John H. Jung, MD, MS, sole proprietor — support@addictionboards.com.</p>',
        '<p>Terms: <a href="https://addictionboards.com/terms">https://addictionboards.com/terms</a></p>',
        '<p>Privacy: <a href="https://addictionboards.com/privacy">https://addictionboards.com/privacy</a></p>',
      ].join(''),
    });
  });

  it('states a yearly price and no trial for an annual consent without one, escaping its HTML', async () => {
    const payload = await sentPayload({
      consent: {
        ...consent,
        plan: 'annual',
        amountCents: 22_900,
        frequency: 'year',
        trialEndsAt: null,
        cancellationMethod: 'Billing page <in the app> & support email',
      },
      destination: 'subscriber@example.com',
    });

    expect(payload.text.split('\n')).toEqual(
      expect.arrayContaining([
        'Price and frequency: $229.00 USD every year.',
        'No introductory trial was recorded.',
        'How to cancel: Billing page <in the app> & support email',
      ]),
    );
    expect(payload.html).toContain(
      '<p>Price and frequency: $229.00 USD every year.</p><p>No introductory trial was recorded.</p>',
    );
    expect(payload.html).toContain(
      '<p>How to cancel: Billing page &lt;in the app&gt; &amp; support email</p>',
    );
  });
});
