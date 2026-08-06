import { and, eq, lt, or } from 'drizzle-orm';
import { trialPaymentMethodSetupOperations } from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  TrialPaymentMethodSetupOperation,
  TrialPaymentMethodSetupOperationInput,
  TrialPaymentMethodSetupOperationRepository,
} from '@/src/application/ports/repositories';

type OperationRow = typeof trialPaymentMethodSetupOperations.$inferSelect;

function toOperation(row: OperationRow): TrialPaymentMethodSetupOperation {
  if (
    (row.plan !== 'monthly' && row.plan !== 'annual') ||
    row.currency !== 'usd' ||
    (row.frequency !== 'month' && row.frequency !== 'year')
  ) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Invalid trial payment-method setup operation row',
    );
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    plan: row.plan,
    amountCents: row.amountCents,
    currency: row.currency,
    frequency: row.frequency,
    trialEndsAt: row.trialEndsAt,
    disclosureSnapshot: row.disclosureSnapshot,
    disclosureVersion: row.disclosureVersion,
    termsVersion: row.termsVersion,
    termsHash: row.termsHash,
    status: row.status,
    claimId: row.claimId,
    claimedAt: row.claimedAt,
    stripePaymentMethodId: row.stripePaymentMethodId,
    paymentMethodAttachedAt: row.paymentMethodAttachedAt,
    subscriptionDefaultSetAt: row.subscriptionDefaultSetAt,
    completedAt: row.completedAt,
  };
}

function snapshotsMatch(
  row: OperationRow,
  input: TrialPaymentMethodSetupOperationInput,
): boolean {
  return (
    row.sessionId === input.sessionId &&
    row.userId === input.userId &&
    row.stripeCustomerId === input.stripeCustomerId &&
    row.stripeSubscriptionId === input.stripeSubscriptionId &&
    row.plan === input.plan &&
    row.amountCents === input.amountCents &&
    row.currency === input.currency &&
    row.frequency === input.frequency &&
    row.trialEndsAt.getTime() === input.trialEndsAt.getTime() &&
    row.disclosureSnapshot === input.disclosureSnapshot &&
    row.disclosureVersion === input.disclosureVersion &&
    row.termsVersion === input.termsVersion &&
    row.termsHash === input.termsHash
  );
}

export class DrizzleTrialPaymentMethodSetupOperationRepository
  implements TrialPaymentMethodSetupOperationRepository
{
  constructor(
    private readonly db: DrizzleDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createPending(
    input: TrialPaymentMethodSetupOperationInput,
  ): Promise<void> {
    const [inserted] = await this.db
      .insert(trialPaymentMethodSetupOperations)
      .values({ ...input, status: 'pending', updatedAt: this.now() })
      .onConflictDoNothing()
      .returning({ sessionId: trialPaymentMethodSetupOperations.sessionId });
    if (inserted) return;

    const existing =
      await this.db.query.trialPaymentMethodSetupOperations.findFirst({
        where: eq(trialPaymentMethodSetupOperations.sessionId, input.sessionId),
      });
    if (!existing) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Trial payment-method setup operation disappeared after conflict',
      );
    }
    if (!snapshotsMatch(existing, input)) {
      throw new ApplicationError(
        'CONFLICT',
        'Trial payment-method setup snapshot changed for Checkout Session',
      );
    }
  }

  async findBySessionId(
    sessionId: string,
  ): Promise<TrialPaymentMethodSetupOperation | null> {
    const row = await this.db.query.trialPaymentMethodSetupOperations.findFirst(
      {
        where: eq(trialPaymentMethodSetupOperations.sessionId, sessionId),
      },
    );
    return row ? toOperation(row) : null;
  }

  async claim(
    sessionId: string,
    claimId: string,
    claimedAt: Date,
    staleBefore: Date,
  ): Promise<TrialPaymentMethodSetupOperation | null> {
    const [row] = await this.db
      .update(trialPaymentMethodSetupOperations)
      .set({
        status: 'processing',
        claimId,
        claimedAt,
        updatedAt: claimedAt,
      })
      .where(
        and(
          eq(trialPaymentMethodSetupOperations.sessionId, sessionId),
          or(
            eq(trialPaymentMethodSetupOperations.status, 'pending'),
            and(
              eq(trialPaymentMethodSetupOperations.status, 'processing'),
              lt(trialPaymentMethodSetupOperations.claimedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning();
    return row ? toOperation(row) : null;
  }

  async markPaymentMethodAttached(
    sessionId: string,
    claimId: string,
    stripePaymentMethodId: string,
    attachedAt: Date,
  ): Promise<void> {
    await this.updateClaimedOperation(sessionId, claimId, {
      stripePaymentMethodId,
      paymentMethodAttachedAt: attachedAt,
      updatedAt: attachedAt,
    });
  }

  async markSubscriptionDefaultSet(
    sessionId: string,
    claimId: string,
    selectedAt: Date,
  ): Promise<void> {
    await this.updateClaimedOperation(sessionId, claimId, {
      subscriptionDefaultSetAt: selectedAt,
      updatedAt: selectedAt,
    });
  }

  async markCompleted(
    sessionId: string,
    claimId: string,
    completedAt: Date,
  ): Promise<void> {
    await this.updateClaimedOperation(sessionId, claimId, {
      status: 'completed',
      completedAt,
      updatedAt: completedAt,
    });
  }

  private async updateClaimedOperation(
    sessionId: string,
    claimId: string,
    values: Partial<typeof trialPaymentMethodSetupOperations.$inferInsert>,
  ): Promise<void> {
    const [updated] = await this.db
      .update(trialPaymentMethodSetupOperations)
      .set(values)
      .where(
        and(
          eq(trialPaymentMethodSetupOperations.sessionId, sessionId),
          eq(trialPaymentMethodSetupOperations.status, 'processing'),
          eq(trialPaymentMethodSetupOperations.claimId, claimId),
        ),
      )
      .returning({ sessionId: trialPaymentMethodSetupOperations.sessionId });
    if (!updated) {
      throw new ApplicationError(
        'CONFLICT',
        'Trial payment-method setup operation is not owned by this claim',
      );
    }
  }
}
