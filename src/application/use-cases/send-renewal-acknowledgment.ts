import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalNoticeDeliveryRepository,
  Sha256Hasher,
  TransactionalEmailPayload,
} from '@/src/application/ports';
import {
  escapeRenewalNoticeHtml,
  formatRenewalNoticeDate,
  RENEWAL_NOTICE_BUSINESS_CONTACT,
  RENEWAL_NOTICE_FROM,
  RENEWAL_NOTICE_REPLY_TO,
} from '@/src/application/shared/renewal-notice-email-format';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import type {
  RenewalConsentRecord,
  RenewalNoticeDelivery,
} from '@/src/domain/entities';

function formatAmount(consent: RenewalConsentRecord): string {
  const amount = `$${(consent.amountCents / 100).toFixed(2)}`;
  const interval = consent.frequency === 'month' ? 'month' : 'year';
  return `${amount} ${consent.currency.toUpperCase()} every ${interval}`;
}

function createPayload(input: {
  consent: RenewalConsentRecord;
  destination: string;
  appUrl: string;
}): TransactionalEmailPayload {
  const { consent } = input;
  const termsUrl = new URL('/terms', input.appUrl).toString();
  const privacyUrl = new URL('/privacy', input.appUrl).toString();
  const trial = consent.trialEndsAt
    ? `Trial ends: ${formatRenewalNoticeDate(consent.trialEndsAt)}.`
    : 'No introductory trial was recorded.';
  const lines = [
    'Thank you for confirming your Addiction Boards subscription terms.',
    '',
    `Accepted renewal terms: ${consent.disclosureSnapshot}`,
    `Price and frequency: ${formatAmount(consent)}.`,
    trial,
    `Cancellation deadline: ${formatRenewalNoticeDate(consent.cancellationDeadline)}.`,
    `How to cancel: ${consent.cancellationMethod}`,
    `Accepted: ${consent.acceptedAt.toISOString()}.`,
    `Terms version: ${consent.termsVersion}.`,
    `Business contact: ${RENEWAL_NOTICE_BUSINESS_CONTACT}.`,
    `Terms: ${termsUrl}`,
    `Privacy: ${privacyUrl}`,
  ];
  const text = lines.join('\n');
  const html = lines
    .map((line) =>
      line.length === 0 ? '<br>' : `<p>${escapeRenewalNoticeHtml(line)}</p>`,
    )
    .join('');

  return {
    from: RENEWAL_NOTICE_FROM,
    to: input.destination,
    replyTo: RENEWAL_NOTICE_REPLY_TO,
    subject: 'Your Addiction Boards subscription terms',
    html,
    text,
  };
}

export class SendRenewalAcknowledgmentUseCase {
  constructor(
    private readonly deliveryRepository: RenewalNoticeDeliveryRepository,
    private readonly hasher: Sha256Hasher,
    private readonly appUrl: string,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: {
    consent: RenewalConsentRecord;
    destination: string;
  }): Promise<RenewalNoticeDelivery> {
    const destination = input.destination.trim();
    if (destination.length === 0) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Renewal acknowledgment requires a destination',
      );
    }
    const id = this.createId();
    const payload = createPayload({
      consent: input.consent,
      destination,
      appUrl: this.appUrl,
    });
    const evidence = createTransactionalEmailPayloadSnapshot(
      payload,
      this.hasher,
    );

    return this.deliveryRepository.saveQueued({
      id,
      noticeKind: 'acknowledgment',
      consentRecordId: input.consent.id,
      externalSubscriptionId: null,
      applicableAt: null,
      disclosureVersion: input.consent.disclosureVersion,
      destination,
      providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
      payloadSnapshot: evidence.snapshot,
      payloadHash: evidence.hash,
    });
  }
}
