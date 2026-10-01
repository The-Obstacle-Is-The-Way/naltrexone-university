import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalNoticeDeliveryRepository,
  Sha256Hasher,
  TransactionalEmailPayload,
} from '@/src/application/ports';
import {
  CANCELLATION_AND_REFUND_POLICY,
  formatRenewalNoticeCutoff,
  RENEWAL_NOTICE_BILLING_PATH,
  RENEWAL_NOTICE_BUSINESS_CONTACT,
  RENEWAL_NOTICE_FROM,
  RENEWAL_NOTICE_REPLY_TO,
  RENEWAL_NOTICE_SUPPORT_EMAIL,
  type RenewalNoticeLine,
  renderRenewalNoticeHtml,
  renderRenewalNoticeText,
  renewalNoticeLink,
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
  const trial = consent.trialEndsAt
    ? `Trial ends: ${formatRenewalNoticeCutoff(consent.trialEndsAt)}.`
    : 'No introductory trial was recorded.';
  // DEBT-414 F06's links, as a scheduled notice gives them: the online
  // cancellation route, support mail, Terms and Privacy.
  const lines: RenewalNoticeLine[] = [
    ['Thank you for confirming your Addiction Boards subscription terms.'],
    [`Accepted renewal terms: ${consent.disclosureSnapshot}`],
    [`Price and frequency: ${formatAmount(consent)}.`],
    [trial],
    [
      `Cancellation deadline: ${formatRenewalNoticeCutoff(consent.cancellationDeadline)}.`,
    ],
    [`How to cancel: ${consent.cancellationMethod}`],
    [
      'Cancel online on the Billing page: ',
      renewalNoticeLink(
        new URL(RENEWAL_NOTICE_BILLING_PATH, input.appUrl).toString(),
      ),
    ],
    [
      'Or email ',
      {
        href: `mailto:${RENEWAL_NOTICE_SUPPORT_EMAIL}`,
        label: RENEWAL_NOTICE_SUPPORT_EMAIL,
      },
      ' from the email address on your account.',
    ],
    [`Cancellation and refunds: ${CANCELLATION_AND_REFUND_POLICY}`],
    [`Accepted: ${consent.acceptedAt.toISOString()}.`],
    [`Terms version: ${consent.termsVersion}.`],
    [`Business contact: ${RENEWAL_NOTICE_BUSINESS_CONTACT}.`],
    ['Terms: ', renewalNoticeLink(new URL('/terms', input.appUrl).toString())],
    [
      'Privacy: ',
      renewalNoticeLink(new URL('/privacy', input.appUrl).toString()),
    ],
  ];

  return {
    from: RENEWAL_NOTICE_FROM,
    to: input.destination,
    replyTo: RENEWAL_NOTICE_REPLY_TO,
    subject: 'Your Addiction Boards subscription terms',
    html: renderRenewalNoticeHtml(lines),
    text: renderRenewalNoticeText(lines),
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
