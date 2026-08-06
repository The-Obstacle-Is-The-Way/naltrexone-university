import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalConsentRecordRepository,
  RenewalConsentSourceLookup,
} from '@/src/application/ports/repositories';
import type {
  NewRenewalConsentRecord,
  RenewalConsentRecord,
} from '@/src/domain/entities';
import { terminateRenewalConsentRecord } from '@/src/domain/entities';

function cloneRecord(record: RenewalConsentRecord): RenewalConsentRecord {
  return {
    ...record,
    trialEndsAt: record.trialEndsAt ? new Date(record.trialEndsAt) : null,
    cancellationDeadline: new Date(record.cancellationDeadline),
    acceptedAt: new Date(record.acceptedAt),
    effectiveRenewalAt: record.effectiveRenewalAt
      ? new Date(record.effectiveRenewalAt)
      : null,
    subscriptionTerminatedAt: record.subscriptionTerminatedAt
      ? new Date(record.subscriptionTerminatedAt)
      : null,
    retainUntil: new Date(record.retainUntil),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function immutableSnapshot(record: NewRenewalConsentRecord): string {
  return JSON.stringify({
    consumerReference: record.consumerReference,
    stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId,
    checkoutSessionId: record.checkoutSessionId,
    setupSessionId: record.setupSessionId,
    plan: record.plan,
    amountCents: record.amountCents,
    currency: record.currency,
    frequency: record.frequency,
    trialEndsAt: record.trialEndsAt,
    cancellationDeadline: record.cancellationDeadline,
    cancellationMethod: record.cancellationMethod,
    disclosureSnapshot: record.disclosureSnapshot,
    disclosureVersion: record.disclosureVersion,
    termsVersion: record.termsVersion,
    termsHash: record.termsHash,
    consentSource: record.consentSource,
    acceptedAt: record.acceptedAt,
    consentKind: record.consentKind,
    priorAmountCents: record.priorAmountCents,
    proposedAmountCents: record.proposedAmountCents,
    effectiveRenewalAt: record.effectiveRenewalAt,
  });
}

export class FakeRenewalConsentRecordRepository
  implements RenewalConsentRecordRepository
{
  private readonly records = new Map<string, RenewalConsentRecord>();
  private sequence = 0;

  snapshot(): RenewalConsentRecord[] {
    return Array.from(this.records.values(), cloneRecord);
  }

  restore(records: readonly RenewalConsentRecord[]): void {
    this.records.clear();
    for (const record of records) {
      this.records.set(record.id, cloneRecord(record));
    }
  }

  clearUserReference(userId: string): void {
    for (const [id, record] of this.records) {
      if (record.userId === userId) {
        this.records.set(id, { ...record, userId: null });
      }
    }
  }

  async save(input: NewRenewalConsentRecord): Promise<RenewalConsentRecord> {
    const source: RenewalConsentSourceLookup = input.checkoutSessionId
      ? { checkoutSessionId: input.checkoutSessionId }
      : { setupSessionId: input.setupSessionId ?? '' };
    const existing = this.findStoredBySource(source);
    if (existing) {
      if (
        (existing.userId !== null && existing.userId !== input.userId) ||
        immutableSnapshot(existing) !== immutableSnapshot(input)
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'Renewal consent source is already bound to different evidence',
        );
      }
      return cloneRecord(existing);
    }

    this.sequence += 1;
    const now = new Date();
    const saved: RenewalConsentRecord = {
      ...input,
      id: `consent_${this.sequence}`,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(saved.id, saved);
    return cloneRecord(saved);
  }

  async findById(id: string): Promise<RenewalConsentRecord | null> {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : null;
  }

  async findBySource(
    source: RenewalConsentSourceLookup,
  ): Promise<RenewalConsentRecord | null> {
    const record = this.findStoredBySource(source);
    return record ? cloneRecord(record) : null;
  }

  async markSubscriptionTerminated(input: {
    stripeSubscriptionId: string;
    terminatedAt: Date;
  }): Promise<number> {
    let count = 0;
    for (const [id, record] of this.records) {
      if (record.stripeSubscriptionId !== input.stripeSubscriptionId) continue;
      this.records.set(id, {
        ...terminateRenewalConsentRecord(record, input.terminatedAt),
        updatedAt: new Date(),
      });
      count += 1;
    }
    return count;
  }

  async pruneExpired(input: { before: Date; limit: number }): Promise<number> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return 0;
    const ids = this.snapshot()
      .filter(
        (record) =>
          record.subscriptionTerminatedAt !== null &&
          record.retainUntil <= input.before,
      )
      .sort((a, b) => a.retainUntil.getTime() - b.retainUntil.getTime())
      .slice(0, input.limit)
      .map((record) => record.id);
    for (const id of ids) this.records.delete(id);
    return ids.length;
  }

  private findStoredBySource(
    source: RenewalConsentSourceLookup,
  ): RenewalConsentRecord | null {
    for (const record of this.records.values()) {
      if (
        ('checkoutSessionId' in source &&
          record.checkoutSessionId === source.checkoutSessionId) ||
        ('setupSessionId' in source &&
          record.setupSessionId === source.setupSessionId)
      ) {
        return record;
      }
    }
    return null;
  }
}
