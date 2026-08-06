import { ApplicationError } from '@/src/application/errors';
import type {
  ClaimRenewalNoticeDeliveryInput,
  MarkRenewalNoticeDeliveryFailureInput,
  RenewalNoticeDeliveryRepository,
} from '@/src/application/ports/renewal-notice-delivery-repository';
import { assertValidRenewalNoticeDeliveryPayload } from '@/src/application/shared/transactional-email-payload';
import type {
  NewRenewalNoticeDelivery,
  RenewalNoticeDelivery,
} from '@/src/domain/entities';
import { isValidRenewalNoticeDeliveryKeyShape } from '@/src/domain/entities';

function cloneDelivery(delivery: RenewalNoticeDelivery): RenewalNoticeDelivery {
  return structuredClone(delivery);
}

function identityKey(delivery: NewRenewalNoticeDelivery): string {
  return delivery.noticeKind === 'acknowledgment'
    ? [
        delivery.noticeKind,
        delivery.consentRecordId,
        delivery.destination,
      ].join(':')
    : [
        delivery.noticeKind,
        delivery.externalSubscriptionId,
        delivery.applicableAt?.toISOString(),
        delivery.disclosureVersion,
        delivery.destination,
      ].join(':');
}

function immutableFieldsMatch(
  existing: RenewalNoticeDelivery,
  input: NewRenewalNoticeDelivery,
): boolean {
  return (
    identityKey(existing) === identityKey(input) &&
    existing.noticeKind === input.noticeKind &&
    existing.consentRecordId === input.consentRecordId &&
    existing.externalSubscriptionId === input.externalSubscriptionId &&
    existing.applicableAt?.getTime() === input.applicableAt?.getTime() &&
    existing.disclosureVersion === input.disclosureVersion &&
    existing.destination === input.destination &&
    existing.payloadSnapshot === input.payloadSnapshot &&
    existing.payloadHash === input.payloadHash
  );
}

export class FakeRenewalNoticeDeliveryRepository
  implements RenewalNoticeDeliveryRepository
{
  readonly records: RenewalNoticeDelivery[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async saveQueued(
    input: NewRenewalNoticeDelivery,
  ): Promise<RenewalNoticeDelivery> {
    assertValidRenewalNoticeDeliveryPayload(input);
    if (!isValidRenewalNoticeDeliveryKeyShape(input)) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Renewal notice delivery does not match its notice-kind key shape',
      );
    }
    const inputIdentity = identityKey(input);
    const existing = this.records.find(
      (record) =>
        record.id === input.id ||
        record.providerIdempotencyKey === input.providerIdempotencyKey ||
        identityKey(record) === inputIdentity,
    );
    if (existing) {
      if (!immutableFieldsMatch(existing, input)) {
        throw new ApplicationError(
          'CONFLICT',
          'Renewal notice delivery identity is bound to another payload',
        );
      }
      return cloneDelivery(existing);
    }

    const createdAt = this.now();
    const delivery: RenewalNoticeDelivery = {
      ...structuredClone(input),
      status: 'queued',
      providerEventId: null,
      attemptCount: 0,
      attemptId: null,
      attemptStartedAt: null,
      lastAttemptAt: null,
      nextAttemptAt: null,
      failureClass: null,
      failureCode: null,
      requeueReason: null,
      requeuedAt: null,
      requeuedBy: null,
      requeueAudit: [],
      createdAt,
      updatedAt: createdAt,
    };
    this.records.push(delivery);
    return cloneDelivery(delivery);
  }

  async findById(id: string): Promise<RenewalNoticeDelivery | null> {
    const record = this.records.find((candidate) => candidate.id === id);
    return record ? cloneDelivery(record) : null;
  }

  async findDue(input: {
    now: Date;
    limit: number;
  }): Promise<RenewalNoticeDelivery[]> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return [];
    return this.records
      .filter(
        (record) =>
          record.status === 'queued' ||
          (record.status === 'transient_failure' &&
            record.nextAttemptAt !== null &&
            record.nextAttemptAt.getTime() <= input.now.getTime()),
      )
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .slice(0, input.limit)
      .map(cloneDelivery);
  }

  async claim(
    input: ClaimRenewalNoticeDeliveryInput,
  ): Promise<RenewalNoticeDelivery | null> {
    const record = this.records.find((candidate) => candidate.id === input.id);
    if (
      !record ||
      (record.status !== 'queued' &&
        !(
          record.status === 'transient_failure' &&
          record.nextAttemptAt !== null &&
          record.nextAttemptAt.getTime() <= input.startedAt.getTime()
        ))
    ) {
      return null;
    }

    Object.assign(record, {
      status: 'processing' as const,
      attemptCount: record.attemptCount + 1,
      attemptId: input.attemptId,
      attemptStartedAt: input.startedAt,
      lastAttemptAt: input.startedAt,
      nextAttemptAt: null,
      failureClass: null,
      failureCode: null,
      updatedAt: input.startedAt,
    });
    return cloneDelivery(record);
  }

  async markDelivered(input: {
    id: string;
    attemptId: string;
    providerEventId: string;
    completedAt: Date;
  }): Promise<RenewalNoticeDelivery> {
    const record = this.requireOwnedClaim(input.id, input.attemptId);
    Object.assign(record, {
      status: 'delivered' as const,
      providerEventId: input.providerEventId,
      nextAttemptAt: null,
      failureClass: null,
      failureCode: null,
      updatedAt: input.completedAt,
    });
    return cloneDelivery(record);
  }

  markTransientFailure(
    input: MarkRenewalNoticeDeliveryFailureInput & { nextAttemptAt: Date },
  ): Promise<RenewalNoticeDelivery> {
    return this.markFailure('transient_failure', input, input.nextAttemptAt);
  }

  markTerminalFailure(
    input: MarkRenewalNoticeDeliveryFailureInput,
  ): Promise<RenewalNoticeDelivery> {
    return this.markFailure('terminal_failure', input, null);
  }

  markOutcomeUnknown(
    input: MarkRenewalNoticeDeliveryFailureInput,
  ): Promise<RenewalNoticeDelivery> {
    return this.markFailure('outcome_unknown', input, null);
  }

  async markStaleProcessingUnknown(input: {
    staleBefore: Date;
    observedAt: Date;
    limit: number;
  }): Promise<number> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return 0;
    const stale = this.records
      .filter(
        (record) =>
          record.status === 'processing' &&
          record.attemptStartedAt !== null &&
          record.attemptStartedAt.getTime() < input.staleBefore.getTime(),
      )
      .sort(
        (left, right) =>
          (left.attemptStartedAt?.getTime() ?? 0) -
          (right.attemptStartedAt?.getTime() ?? 0),
      )
      .slice(0, input.limit);

    for (const record of stale) {
      Object.assign(record, {
        status: 'outcome_unknown' as const,
        nextAttemptAt: null,
        failureClass: 'stale_processing_claim',
        failureCode: 'worker_outcome_unknown',
        updatedAt: input.observedAt,
      });
    }
    return stale.length;
  }

  async requeue(input: {
    id: string;
    reason: string;
    requeuedBy: string;
    requeuedAt: Date;
    confirmedNoSend: boolean;
  }): Promise<RenewalNoticeDelivery> {
    const record = this.records.find((candidate) => candidate.id === input.id);
    if (
      !record ||
      (record.status !== 'terminal_failure' &&
        record.status !== 'outcome_unknown')
    ) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice delivery is not eligible for requeue',
      );
    }
    if (record.status === 'outcome_unknown' && !input.confirmedNoSend) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Unknown delivery outcome requires confirmation that no send occurred',
      );
    }

    const priorStatus = record.status;
    record.requeueAudit.push({
      reason: input.reason,
      requeuedAt: input.requeuedAt.toISOString(),
      requeuedBy: input.requeuedBy,
      confirmedNoSend: input.confirmedNoSend,
      priorStatus,
    });
    Object.assign(record, {
      status: 'queued' as const,
      providerEventId: null,
      nextAttemptAt: null,
      failureClass: null,
      failureCode: null,
      requeueReason: input.reason,
      requeuedAt: input.requeuedAt,
      requeuedBy: input.requeuedBy,
      updatedAt: input.requeuedAt,
    });
    return cloneDelivery(record);
  }

  private async markFailure(
    status: 'transient_failure' | 'terminal_failure' | 'outcome_unknown',
    input: MarkRenewalNoticeDeliveryFailureInput,
    nextAttemptAt: Date | null,
  ): Promise<RenewalNoticeDelivery> {
    const record = this.requireOwnedClaim(input.id, input.attemptId);
    Object.assign(record, {
      status,
      nextAttemptAt,
      failureClass: input.failureClass,
      failureCode: input.failureCode,
      updatedAt: input.failedAt,
    });
    return cloneDelivery(record);
  }

  private requireOwnedClaim(
    id: string,
    attemptId: string,
  ): RenewalNoticeDelivery {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record?.status !== 'processing' || record.attemptId !== attemptId) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice delivery is not owned by this attempt',
      );
    }
    return record;
  }
}
