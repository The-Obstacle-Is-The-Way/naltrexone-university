import { and, asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { renewalConsentRecords } from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalConsentRecordRepository,
  RenewalConsentSourceLookup,
} from '@/src/application/ports/repositories';
import type {
  NewRenewalConsentRecord,
  RenewalConsentRecord,
} from '@/src/domain/entities';

type ConsentRow = typeof renewalConsentRecords.$inferSelect;

function toRecord(row: ConsentRow): RenewalConsentRecord {
  if (
    (row.plan !== 'monthly' && row.plan !== 'annual') ||
    row.currency !== 'usd' ||
    (row.frequency !== 'month' && row.frequency !== 'year')
  ) {
    throw new ApplicationError('INTERNAL_ERROR', 'Invalid renewal consent row');
  }

  return {
    ...row,
    plan: row.plan,
    currency: row.currency,
    frequency: row.frequency,
  };
}

function dateMatches(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) return left === right;
  return left.getTime() === right.getTime();
}

function immutableEvidenceMatches(
  row: ConsentRow,
  input: NewRenewalConsentRecord,
): boolean {
  return (
    (row.userId === null || row.userId === input.userId) &&
    row.consumerReference === input.consumerReference &&
    row.stripeCustomerId === input.stripeCustomerId &&
    row.stripeSubscriptionId === input.stripeSubscriptionId &&
    row.checkoutSessionId === input.checkoutSessionId &&
    row.setupSessionId === input.setupSessionId &&
    row.plan === input.plan &&
    row.amountCents === input.amountCents &&
    row.currency === input.currency &&
    row.frequency === input.frequency &&
    dateMatches(row.trialEndsAt, input.trialEndsAt) &&
    row.cancellationDeadline.getTime() ===
      input.cancellationDeadline.getTime() &&
    row.cancellationMethod === input.cancellationMethod &&
    row.disclosureSnapshot === input.disclosureSnapshot &&
    row.disclosureVersion === input.disclosureVersion &&
    row.termsVersion === input.termsVersion &&
    row.termsHash === input.termsHash &&
    row.consentSource === input.consentSource &&
    row.acceptedAt.getTime() === input.acceptedAt.getTime() &&
    row.consentKind === input.consentKind &&
    row.priorAmountCents === input.priorAmountCents &&
    row.proposedAmountCents === input.proposedAmountCents &&
    dateMatches(row.effectiveRenewalAt, input.effectiveRenewalAt)
  );
}

export class DrizzleRenewalConsentRecordRepository
  implements RenewalConsentRecordRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async save(input: NewRenewalConsentRecord): Promise<RenewalConsentRecord> {
    const [inserted] = await this.db
      .insert(renewalConsentRecords)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (inserted) return toRecord(inserted);

    const existing = await this.findRowBySource(
      input.checkoutSessionId
        ? { checkoutSessionId: input.checkoutSessionId }
        : { setupSessionId: input.setupSessionId ?? '' },
    );
    if (!existing) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Renewal consent disappeared after source conflict',
      );
    }
    if (!immutableEvidenceMatches(existing, input)) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal consent source is already bound to different evidence',
      );
    }
    return toRecord(existing);
  }

  async findById(id: string): Promise<RenewalConsentRecord | null> {
    const row = await this.db.query.renewalConsentRecords.findFirst({
      where: eq(renewalConsentRecords.id, id),
    });
    return row ? toRecord(row) : null;
  }

  async findBySource(
    source: RenewalConsentSourceLookup,
  ): Promise<RenewalConsentRecord | null> {
    const row = await this.findRowBySource(source);
    return row ? toRecord(row) : null;
  }

  async markSubscriptionTerminated(input: {
    stripeSubscriptionId: string;
    terminatedAt: Date;
  }): Promise<number> {
    const terminatedAtIso = input.terminatedAt.toISOString();
    const updated = await this.db
      .update(renewalConsentRecords)
      .set({
        subscriptionTerminatedAt: sql`GREATEST(COALESCE(${renewalConsentRecords.subscriptionTerminatedAt}, ${terminatedAtIso}::timestamptz), ${terminatedAtIso}::timestamptz)`,
        retainUntil: sql`GREATEST(${renewalConsentRecords.retainUntil}, ${renewalConsentRecords.acceptedAt} + INTERVAL '3 years', ${terminatedAtIso}::timestamptz + INTERVAL '1 year')`,
        updatedAt: this.now(),
      })
      .where(
        eq(
          renewalConsentRecords.stripeSubscriptionId,
          input.stripeSubscriptionId,
        ),
      )
      .returning({ id: renewalConsentRecords.id });
    return updated.length;
  }

  async pruneExpired(input: { before: Date; limit: number }): Promise<number> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return 0;

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: renewalConsentRecords.id })
        .from(renewalConsentRecords)
        .where(
          and(
            isNotNull(renewalConsentRecords.subscriptionTerminatedAt),
            lte(renewalConsentRecords.retainUntil, input.before),
          ),
        )
        .orderBy(asc(renewalConsentRecords.retainUntil))
        .limit(input.limit);
      if (rows.length === 0) return 0;

      const deleted = await tx
        .delete(renewalConsentRecords)
        .where(
          and(
            inArray(
              renewalConsentRecords.id,
              rows.map((row) => row.id),
            ),
            isNotNull(renewalConsentRecords.subscriptionTerminatedAt),
            lte(renewalConsentRecords.retainUntil, input.before),
          ),
        )
        .returning({ id: renewalConsentRecords.id });
      return deleted.length;
    });
  }

  private findRowBySource(
    source: RenewalConsentSourceLookup,
  ): Promise<ConsentRow | undefined> {
    return this.db.query.renewalConsentRecords.findFirst({
      where:
        'checkoutSessionId' in source
          ? eq(
              renewalConsentRecords.checkoutSessionId,
              source.checkoutSessionId,
            )
          : eq(renewalConsentRecords.setupSessionId, source.setupSessionId),
    });
  }
}
