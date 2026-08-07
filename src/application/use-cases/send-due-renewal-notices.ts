import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalNoticeDeliveryRepository,
  Sha256Hasher,
  TransactionalEmailPayload,
} from '@/src/application/ports';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import type { RenewalNoticeKind } from '@/src/domain/entities';
import type { DispatchRenewalNoticeDeliveryUseCase } from './dispatch-renewal-notice-delivery';

const FROM = 'Addiction Boards <notices@addictionboards.com>';
const REPLY_TO = 'support@addictionboards.com';
const BUSINESS_CONTACT =
  'John H. Jung, MD, MS, sole proprietor — support@addictionboards.com';
const PROCESSING_CLAIM_STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_BATCH_LIMIT = 500;
const DISPATCH_CONCURRENCY = 4;

export type ScheduledRenewalNotice = {
  noticeKind: Exclude<RenewalNoticeKind, 'acknowledgment'>;
  externalSubscriptionId: string;
  applicableAt: Date;
  disclosureVersion: string;
  destination: string;
  planName: string;
  amountCents: number;
  currency: 'usd';
  frequency: 'month' | 'year';
  cancellationMethod: string;
  changeDescription: string | null;
};

export type SendDueRenewalNoticesResult = {
  queued: number;
  selected: number;
  staleUnknown: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

function formatAmount(notice: ScheduledRenewalNotice): string {
  return `$${(notice.amountCents / 100).toFixed(2)} ${notice.currency.toUpperCase()} every ${notice.frequency}`;
}

function getHeading(noticeKind: ScheduledRenewalNotice['noticeKind']): string {
  switch (noticeKind) {
    case 'annual_reminder':
      return 'Annual subscription reminder';
    case 'renewal_notice':
      return 'Upcoming annual subscription renewal';
    case 'material_change':
      return 'Material subscription change';
    case 'fee_change':
      return 'Subscription fee change';
  }
}

function createPayload(
  notice: ScheduledRenewalNotice,
  appUrl: string,
): TransactionalEmailPayload {
  const termsUrl = new URL('/terms', appUrl).toString();
  const privacyUrl = new URL('/privacy', appUrl).toString();
  const heading = getHeading(notice.noticeKind);
  const detail =
    notice.noticeKind === 'material_change' ||
    notice.noticeKind === 'fee_change'
      ? [
          `Material change effective: ${formatDate(notice.applicableAt)}.`,
          `Change: ${notice.changeDescription ?? ''}`,
        ]
      : [
          `Renewal date: ${formatDate(notice.applicableAt)}.`,
          `Renewal amount and frequency: ${formatAmount(notice)}.`,
        ];
  const lines = [
    `${heading} for ${notice.planName}.`,
    ...detail,
    `How to cancel before the applicable date: ${notice.cancellationMethod}`,
    `Business contact: ${BUSINESS_CONTACT}.`,
    `Terms: ${termsUrl}`,
    `Privacy: ${privacyUrl}`,
  ];
  const text = lines.join('\n');
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');

  return {
    from: FROM,
    to: notice.destination,
    replyTo: REPLY_TO,
    subject: `Addiction Boards — ${heading}`,
    html,
    text,
  };
}

function validateNotice(notice: ScheduledRenewalNotice): void {
  if (
    notice.destination.trim().length === 0 ||
    notice.externalSubscriptionId.trim().length === 0 ||
    notice.disclosureVersion.trim().length === 0
  ) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Scheduled renewal notice identity is incomplete',
    );
  }
  if (
    (notice.noticeKind === 'material_change' ||
      notice.noticeKind === 'fee_change') &&
    !notice.changeDescription?.trim()
  ) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Change notice requires a change description',
    );
  }
}

export class SendDueRenewalNoticesUseCase {
  constructor(
    private readonly repository: RenewalNoticeDeliveryRepository,
    private readonly hasher: Sha256Hasher,
    private readonly dispatch: Pick<
      DispatchRenewalNoticeDeliveryUseCase,
      'execute'
    >,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: {
    notices: readonly ScheduledRenewalNotice[];
    limit: number;
  }): Promise<SendDueRenewalNoticesResult> {
    const observedAt = this.now();
    const limit = Math.min(
      MAX_BATCH_LIMIT,
      Math.max(1, Number.isInteger(input.limit) ? input.limit : 1),
    );
    const staleUnknown = await this.repository.markStaleProcessingUnknown({
      staleBefore: new Date(
        observedAt.getTime() - PROCESSING_CLAIM_STALE_AFTER_MS,
      ),
      observedAt,
      limit,
    });

    let queued = 0;
    for (const sourceNotice of input.notices) {
      validateNotice(sourceNotice);
      const notice = {
        ...sourceNotice,
        destination: sourceNotice.destination.trim(),
      };
      const id = this.createId();
      const payload = createPayload(notice, this.appUrl);
      const evidence = createTransactionalEmailPayloadSnapshot(
        payload,
        this.hasher,
      );
      const saved = await this.repository.saveQueued({
        id,
        noticeKind: notice.noticeKind,
        consentRecordId: null,
        externalSubscriptionId: notice.externalSubscriptionId,
        applicableAt: notice.applicableAt,
        disclosureVersion: notice.disclosureVersion,
        destination: notice.destination,
        providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(id),
        payloadSnapshot: evidence.snapshot,
        payloadHash: evidence.hash,
      });
      if (saved.id === id) queued += 1;
    }

    const due = await this.repository.findDue({ now: observedAt, limit });
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(DISPATCH_CONCURRENCY, due.length) },
      async () => {
        for (;;) {
          const delivery = due[nextIndex];
          nextIndex += 1;
          if (!delivery) return;
          try {
            await this.dispatch.execute({ deliveryId: delivery.id });
          } catch {
            // Isolate a poisoned row so every selected delivery is awaited.
          }
        }
      },
    );
    await Promise.all(workers);

    return { queued, selected: due.length, staleUnknown };
  }
}
