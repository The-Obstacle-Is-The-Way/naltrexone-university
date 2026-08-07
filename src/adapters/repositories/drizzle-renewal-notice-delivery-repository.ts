import { and, asc, eq, lte, or, type SQL, sql } from 'drizzle-orm';
import { renewalNoticeDeliveries } from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  ClaimRenewalNoticeDeliveryInput,
  MarkRenewalNoticeDeliveryFailureInput,
  RenewalNoticeDeliveryRepository,
} from '@/src/application/ports/repositories';
import { assertValidRenewalNoticeDeliveryPayload } from '@/src/application/shared/transactional-email-payload';
import type {
  NewRenewalNoticeDelivery,
  RenewalNoticeDelivery,
} from '@/src/domain/entities';
import { isValidRenewalNoticeDeliveryKeyShape } from '@/src/domain/entities';

type DeliveryRow = typeof renewalNoticeDeliveries.$inferSelect;

function toDelivery(row: DeliveryRow): RenewalNoticeDelivery {
  const { stripeSubscriptionId, ...vendorNeutralRow } = row;
  return {
    ...vendorNeutralRow,
    externalSubscriptionId: stripeSubscriptionId,
  };
}

function datesMatch(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) return left === right;
  return left.getTime() === right.getTime();
}

function immutableFieldsMatch(
  row: DeliveryRow,
  input: NewRenewalNoticeDelivery,
): boolean {
  return (
    row.noticeKind === input.noticeKind &&
    row.consentRecordId === input.consentRecordId &&
    row.stripeSubscriptionId === input.externalSubscriptionId &&
    datesMatch(row.applicableAt, input.applicableAt) &&
    row.disclosureVersion === input.disclosureVersion &&
    row.destination === input.destination &&
    row.payloadSnapshot === input.payloadSnapshot &&
    row.payloadHash === input.payloadHash
  );
}

function assertValidKeyShape(input: NewRenewalNoticeDelivery): void {
  if (!isValidRenewalNoticeDeliveryKeyShape(input)) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Renewal notice delivery does not match its notice-kind key shape',
    );
  }
}

export class DrizzleRenewalNoticeDeliveryRepository
  implements RenewalNoticeDeliveryRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async saveQueued(
    input: NewRenewalNoticeDelivery,
  ): Promise<RenewalNoticeDelivery> {
    assertValidRenewalNoticeDeliveryPayload(input);
    assertValidKeyShape(input);
    const { externalSubscriptionId, ...vendorNeutralInput } = input;
    const [inserted] = await this.db
      .insert(renewalNoticeDeliveries)
      .values({
        ...vendorNeutralInput,
        stripeSubscriptionId: externalSubscriptionId,
        status: 'queued',
        updatedAt: this.now(),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return toDelivery(inserted);

    const existing = await this.findConflictRow(input);
    if (!existing) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Renewal notice delivery disappeared after conflict',
      );
    }
    if (!immutableFieldsMatch(existing, input)) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice delivery identity is bound to another payload',
      );
    }
    return toDelivery(existing);
  }

  async findById(id: string): Promise<RenewalNoticeDelivery | null> {
    const row = await this.db.query.renewalNoticeDeliveries.findFirst({
      where: eq(renewalNoticeDeliveries.id, id),
    });
    return row ? toDelivery(row) : null;
  }

  async findDue(input: {
    now: Date;
    limit: number;
  }): Promise<RenewalNoticeDelivery[]> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return [];
    const rows = await this.db
      .select()
      .from(renewalNoticeDeliveries)
      .where(
        or(
          eq(renewalNoticeDeliveries.status, 'queued'),
          and(
            eq(renewalNoticeDeliveries.status, 'transient_failure'),
            lte(renewalNoticeDeliveries.nextAttemptAt, input.now),
          ),
        ),
      )
      .orderBy(
        asc(renewalNoticeDeliveries.createdAt),
        asc(renewalNoticeDeliveries.id),
      )
      .limit(input.limit);
    return rows.map(toDelivery);
  }

  async claim(
    input: ClaimRenewalNoticeDeliveryInput,
  ): Promise<RenewalNoticeDelivery | null> {
    const [row] = await this.db
      .update(renewalNoticeDeliveries)
      .set({
        status: 'processing',
        attemptCount: sql`${renewalNoticeDeliveries.attemptCount} + 1`,
        attemptId: input.attemptId,
        attemptStartedAt: input.startedAt,
        lastAttemptAt: input.startedAt,
        nextAttemptAt: null,
        failureClass: null,
        failureCode: null,
        updatedAt: input.startedAt,
      })
      .where(
        and(
          eq(renewalNoticeDeliveries.id, input.id),
          or(
            eq(renewalNoticeDeliveries.status, 'queued'),
            and(
              eq(renewalNoticeDeliveries.status, 'transient_failure'),
              lte(renewalNoticeDeliveries.nextAttemptAt, input.startedAt),
            ),
          ),
        ),
      )
      .returning();
    return row ? toDelivery(row) : null;
  }

  markDelivered(input: {
    id: string;
    attemptId: string;
    providerEventId: string;
    completedAt: Date;
  }): Promise<RenewalNoticeDelivery> {
    return this.updateOwnedClaim(input.id, input.attemptId, {
      status: 'delivered',
      providerEventId: input.providerEventId,
      nextAttemptAt: null,
      failureClass: null,
      failureCode: null,
      updatedAt: input.completedAt,
    });
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
    const staleBefore = sql.param(
      input.staleBefore,
      renewalNoticeDeliveries.attemptStartedAt,
    );
    const observedAt = sql.param(
      input.observedAt,
      renewalNoticeDeliveries.updatedAt,
    );
    const updated = await this.db.execute<{ id: string }>(sql`
      WITH candidates AS (
        SELECT ${renewalNoticeDeliveries.id} AS id
        FROM ${renewalNoticeDeliveries}
        WHERE ${renewalNoticeDeliveries.status} = 'processing'
          AND ${renewalNoticeDeliveries.attemptStartedAt} < ${staleBefore}
        ORDER BY
          ${renewalNoticeDeliveries.attemptStartedAt},
          ${renewalNoticeDeliveries.id}
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${renewalNoticeDeliveries}
      SET
        status = 'outcome_unknown',
        next_attempt_at = NULL,
        failure_class = 'stale_processing_claim',
        failure_code = 'worker_outcome_unknown',
        updated_at = ${observedAt}
      FROM candidates
      WHERE ${renewalNoticeDeliveries.id} = candidates.id
        AND ${renewalNoticeDeliveries.status} = 'processing'
        AND ${renewalNoticeDeliveries.attemptStartedAt} < ${staleBefore}
      RETURNING ${renewalNoticeDeliveries.id} AS id
    `);
    return updated.length;
  }

  async requeue(input: {
    id: string;
    reason: string;
    requeuedBy: string;
    requeuedAt: Date;
    confirmedNoSend: boolean;
  }): Promise<RenewalNoticeDelivery> {
    const existing = await this.findById(input.id);
    if (
      !existing ||
      (existing.status !== 'terminal_failure' &&
        existing.status !== 'outcome_unknown')
    ) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice delivery is not eligible for requeue',
      );
    }
    if (existing.status === 'outcome_unknown' && !input.confirmedNoSend) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Unknown delivery outcome requires confirmation that no send occurred',
      );
    }

    const [row] = await this.db
      .update(renewalNoticeDeliveries)
      .set({
        status: 'queued',
        providerEventId: null,
        nextAttemptAt: null,
        failureClass: null,
        failureCode: null,
        requeueReason: input.reason,
        requeuedAt: input.requeuedAt,
        requeuedBy: input.requeuedBy,
        requeueAudit: [
          ...existing.requeueAudit,
          {
            reason: input.reason,
            requeuedAt: input.requeuedAt.toISOString(),
            requeuedBy: input.requeuedBy,
            confirmedNoSend: input.confirmedNoSend,
            priorStatus: existing.status,
          },
        ],
        updatedAt: input.requeuedAt,
      })
      .where(
        and(
          eq(renewalNoticeDeliveries.id, input.id),
          eq(renewalNoticeDeliveries.status, existing.status),
        ),
      )
      .returning();
    if (!row) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice delivery changed before requeue',
      );
    }
    return toDelivery(row);
  }

  private markFailure(
    status: 'transient_failure' | 'terminal_failure' | 'outcome_unknown',
    input: MarkRenewalNoticeDeliveryFailureInput,
    nextAttemptAt: Date | null,
  ): Promise<RenewalNoticeDelivery> {
    return this.updateOwnedClaim(input.id, input.attemptId, {
      status,
      nextAttemptAt,
      failureClass: input.failureClass,
      failureCode: input.failureCode,
      updatedAt: input.failedAt,
    });
  }

  private async updateOwnedClaim(
    id: string,
    attemptId: string,
    values: Partial<typeof renewalNoticeDeliveries.$inferInsert>,
  ): Promise<RenewalNoticeDelivery> {
    const [row] = await this.db
      .update(renewalNoticeDeliveries)
      .set(values)
      .where(
        and(
          eq(renewalNoticeDeliveries.id, id),
          eq(renewalNoticeDeliveries.status, 'processing'),
          eq(renewalNoticeDeliveries.attemptId, attemptId),
        ),
      )
      .returning();
    if (!row) {
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice delivery is not owned by this attempt',
      );
    }
    return toDelivery(row);
  }

  private findConflictRow(
    input: NewRenewalNoticeDelivery,
  ): Promise<DeliveryRow | undefined> {
    let identity: SQL | undefined;
    if (input.noticeKind === 'acknowledgment') {
      if (!input.consentRecordId) {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Acknowledgment delivery requires a consent record ID',
        );
      }
      identity = and(
        eq(renewalNoticeDeliveries.noticeKind, 'acknowledgment'),
        eq(renewalNoticeDeliveries.consentRecordId, input.consentRecordId),
        eq(renewalNoticeDeliveries.destination, input.destination),
      );
    } else {
      if (!input.externalSubscriptionId || !input.applicableAt) {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Scheduled delivery requires a subscription and applicable date',
        );
      }
      identity = and(
        eq(renewalNoticeDeliveries.noticeKind, input.noticeKind),
        eq(
          renewalNoticeDeliveries.stripeSubscriptionId,
          input.externalSubscriptionId,
        ),
        eq(renewalNoticeDeliveries.applicableAt, input.applicableAt),
        eq(renewalNoticeDeliveries.disclosureVersion, input.disclosureVersion),
        eq(renewalNoticeDeliveries.destination, input.destination),
      );
    }
    return this.db.query.renewalNoticeDeliveries.findFirst({
      where: or(
        eq(renewalNoticeDeliveries.id, input.id),
        eq(
          renewalNoticeDeliveries.providerIdempotencyKey,
          input.providerIdempotencyKey,
        ),
        identity,
      ),
    });
  }
}
