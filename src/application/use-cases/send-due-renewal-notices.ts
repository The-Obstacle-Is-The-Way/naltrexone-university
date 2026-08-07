import { ApplicationError } from '@/src/application/errors';
import type {
  Logger,
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
import type { RenewalNoticeKind } from '@/src/domain/entities';
import type { DispatchRenewalNoticeDeliveryUseCase } from './dispatch-renewal-notice-delivery';

const PROCESSING_CLAIM_STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_BATCH_LIMIT = 500;
export const RENEWAL_NOTICE_DISPATCH_CONCURRENCY = 4;

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
  queueFailures: number;
  rejectedNotices: number;
  selected: number;
  staleUnknown: number;
  dispatchFailures: number;
};

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
          `${notice.noticeKind === 'fee_change' ? 'Fee change' : 'Material change'} effective: ${formatRenewalNoticeDate(notice.applicableAt)}.`,
          `Change: ${notice.changeDescription ?? ''}`,
        ]
      : [
          `Renewal date: ${formatRenewalNoticeDate(notice.applicableAt)}.`,
          `Renewal amount and frequency: ${formatAmount(notice)}.`,
        ];
  const lines = [
    `${heading} for ${notice.planName}.`,
    ...detail,
    `How to cancel before the applicable date: ${notice.cancellationMethod}`,
    `Business contact: ${RENEWAL_NOTICE_BUSINESS_CONTACT}.`,
    `Terms: ${termsUrl}`,
    `Privacy: ${privacyUrl}`,
  ];
  const text = lines.join('\n');
  const html = lines
    .map((line) => `<p>${escapeRenewalNoticeHtml(line)}</p>`)
    .join('');

  return {
    from: RENEWAL_NOTICE_FROM,
    to: notice.destination,
    replyTo: RENEWAL_NOTICE_REPLY_TO,
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
    Number.isNaN(notice.applicableAt.getTime()) ||
    !Number.isInteger(notice.amountCents) ||
    notice.amountCents < 0
  ) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Scheduled renewal notice terms are invalid',
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
    private readonly logger: Pick<Logger, 'error'>,
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
    let queueFailures = 0;
    let rejectedNotices = 0;
    for (const sourceNotice of input.notices) {
      try {
        validateNotice(sourceNotice);
      } catch (error) {
        if (
          error instanceof ApplicationError &&
          error.code === 'VALIDATION_ERROR'
        ) {
          rejectedNotices += 1;
          continue;
        }
        throw error;
      }
      try {
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
      } catch (error) {
        queueFailures += 1;
        try {
          this.logger.error(
            {
              noticeKind: sourceNotice.noticeKind,
              stripeSubscriptionId: sourceNotice.externalSubscriptionId,
              errorCode: error instanceof ApplicationError ? error.code : null,
            },
            'Renewal notice queueing failed',
          );
        } catch {
          // Logging failure must not let one poisoned notice starve later rows.
        }
      }
    }

    const due = await this.repository.findDue({ now: observedAt, limit });
    let nextIndex = 0;
    let dispatchFailures = 0;
    const workers = Array.from(
      {
        length: Math.min(RENEWAL_NOTICE_DISPATCH_CONCURRENCY, due.length),
      },
      async () => {
        for (;;) {
          const delivery = due[nextIndex];
          nextIndex += 1;
          if (!delivery) return;
          try {
            await this.dispatch.execute({ deliveryId: delivery.id });
          } catch {
            // Isolate a poisoned row so every selected delivery is awaited.
            dispatchFailures += 1;
          }
        }
      },
    );
    await Promise.all(workers);

    return {
      queued,
      queueFailures,
      rejectedNotices,
      selected: due.length,
      staleUnknown,
      dispatchFailures,
    };
  }
}
