import { ApplicationError } from '@/src/application/errors';
import type {
  Logger,
  RenewalNoticeDeliveryRepository,
  Sha256Hasher,
  TransactionalEmailPayload,
} from '@/src/application/ports';
import {
  formatRenewalNoticeCutoff,
  formatRenewalNoticeDate,
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
    case 'anniversary_reminder':
      return 'Yearly reminder about your monthly subscription';
  }
}

// DEBT-414 F02: a monthly subscriber's yearly reminder, before the renewal
// that carries the subscription past another twelve months.
function anniversaryDetail(
  notice: ScheduledRenewalNotice,
): RenewalNoticeLine[] {
  return [
    [
      `Your Addiction Boards ${notice.planName} subscription renews automatically every ${notice.frequency} unless you cancel.`,
    ],
    [
      `This is your yearly reminder: the renewal on ${formatRenewalNoticeCutoff(notice.applicableAt)} continues your subscription into another year.`,
    ],
    ['Cancel before that time to avoid the renewal charge.'],
    [`Renewal amount and frequency: ${formatAmount(notice)}.`],
  ];
}

function createPayload(
  notice: ScheduledRenewalNotice,
  appUrl: string,
): TransactionalEmailPayload {
  const heading = getHeading(notice.noticeKind);
  const isChangeNotice =
    notice.noticeKind === 'material_change' ||
    notice.noticeKind === 'fee_change';
  // DEBT-414 F06: renewal notices say renewal happens unless canceled, give
  // the exact cutoff with its zone, link the online cancellation route, and
  // restate the cancellation policy the Terms publish.
  const detail: RenewalNoticeLine[] =
    notice.noticeKind === 'anniversary_reminder'
      ? anniversaryDetail(notice)
      : isChangeNotice
        ? [
            [
              `${notice.noticeKind === 'fee_change' ? 'Fee change' : 'Material change'} effective: ${formatRenewalNoticeDate(notice.applicableAt)}.`,
            ],
            [`Change: ${notice.changeDescription ?? ''}`],
          ]
        : [
            [
              `Your Addiction Boards ${notice.planName} subscription renews automatically unless you cancel.`,
            ],
            [
              `Cancel before ${formatRenewalNoticeCutoff(notice.applicableAt)} to avoid the renewal charge.`,
            ],
            [`Renewal amount and frequency: ${formatAmount(notice)}.`],
          ];
  const lines: RenewalNoticeLine[] = [
    [`${heading} for ${notice.planName}.`],
    ...detail,
    [`How to cancel: ${notice.cancellationMethod}.`],
    [
      'Cancel online on the Billing page: ',
      renewalNoticeLink(
        new URL(RENEWAL_NOTICE_BILLING_PATH, appUrl).toString(),
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
    [
      'Cancellation takes effect at the end of your current billing period, and you keep access until then. Except where the law requires otherwise, payments are non-refundable.',
    ],
    [`Business contact: ${RENEWAL_NOTICE_BUSINESS_CONTACT}.`],
    ['Terms: ', renewalNoticeLink(new URL('/terms', appUrl).toString())],
    ['Privacy: ', renewalNoticeLink(new URL('/privacy', appUrl).toString())],
  ];

  return {
    from: RENEWAL_NOTICE_FROM,
    to: notice.destination,
    replyTo: RENEWAL_NOTICE_REPLY_TO,
    subject: `Addiction Boards — ${heading}`,
    html: renderRenewalNoticeHtml(lines),
    text: renderRenewalNoticeText(lines),
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
              errorName: error instanceof Error ? error.name : 'unknown',
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
