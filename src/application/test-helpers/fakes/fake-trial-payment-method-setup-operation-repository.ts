import { ApplicationError } from '@/src/application/errors';
import type {
  ClaimTrialPaymentMethodSetupOperationInput,
  CompleteTrialPaymentMethodSetupOperationInput,
  MarkTrialPaymentMethodAttachedInput,
  MarkTrialSubscriptionDefaultSetInput,
  TrialPaymentMethodSetupOperation,
  TrialPaymentMethodSetupOperationInput,
  TrialPaymentMethodSetupOperationRepository,
} from '@/src/application/ports/trial-payment-method-setup-operation-repository';

function cloneOperation(
  operation: TrialPaymentMethodSetupOperation,
): TrialPaymentMethodSetupOperation {
  return {
    ...operation,
    trialEndsAt: new Date(operation.trialEndsAt),
    claimedAt: operation.claimedAt ? new Date(operation.claimedAt) : null,
    paymentMethodAttachedAt: operation.paymentMethodAttachedAt
      ? new Date(operation.paymentMethodAttachedAt)
      : null,
    subscriptionDefaultSetAt: operation.subscriptionDefaultSetAt
      ? new Date(operation.subscriptionDefaultSetAt)
      : null,
    completedAt: operation.completedAt ? new Date(operation.completedAt) : null,
  };
}

function immutableSnapshot(operation: TrialPaymentMethodSetupOperationInput) {
  return JSON.stringify({
    sessionId: operation.sessionId,
    userId: operation.userId,
    stripeCustomerId: operation.stripeCustomerId,
    stripeSubscriptionId: operation.stripeSubscriptionId,
    plan: operation.plan,
    amountCents: operation.amountCents,
    currency: operation.currency,
    frequency: operation.frequency,
    trialEndsAt: operation.trialEndsAt.toISOString(),
    disclosureSnapshot: operation.disclosureSnapshot,
    disclosureVersion: operation.disclosureVersion,
    termsVersion: operation.termsVersion,
    termsHash: operation.termsHash,
  });
}

export class FakeTrialPaymentMethodSetupOperationRepository
  implements TrialPaymentMethodSetupOperationRepository
{
  private readonly bySessionId = new Map<
    string,
    TrialPaymentMethodSetupOperation
  >();

  snapshot(): TrialPaymentMethodSetupOperation[] {
    return Array.from(this.bySessionId.values(), cloneOperation);
  }

  restore(operations: readonly TrialPaymentMethodSetupOperation[]): void {
    this.bySessionId.clear();
    for (const operation of operations) {
      this.bySessionId.set(operation.sessionId, cloneOperation(operation));
    }
  }

  async createPending(
    input: TrialPaymentMethodSetupOperationInput,
  ): Promise<void> {
    const existing = this.bySessionId.get(input.sessionId);
    if (existing) {
      if (immutableSnapshot(existing) !== immutableSnapshot(input)) {
        throw new ApplicationError(
          'CONFLICT',
          'Trial payment-method setup snapshot changed for Checkout Session',
        );
      }
      return;
    }

    this.bySessionId.set(input.sessionId, {
      ...input,
      trialEndsAt: new Date(input.trialEndsAt),
      status: 'pending',
      claimId: null,
      claimedAt: null,
      stripePaymentMethodId: null,
      paymentMethodAttachedAt: null,
      subscriptionDefaultSetAt: null,
      completedAt: null,
    });
  }

  async findBySessionId(
    sessionId: string,
  ): Promise<TrialPaymentMethodSetupOperation | null> {
    const operation = this.bySessionId.get(sessionId);
    return operation ? cloneOperation(operation) : null;
  }

  async claim({
    sessionId,
    claimId,
    claimedAt,
    staleBefore,
  }: ClaimTrialPaymentMethodSetupOperationInput): Promise<TrialPaymentMethodSetupOperation | null> {
    const operation = this.bySessionId.get(sessionId);
    if (!operation || operation.status === 'completed') return null;
    if (
      operation.status === 'processing' &&
      operation.claimedAt &&
      operation.claimedAt >= staleBefore
    ) {
      return null;
    }

    const claimed: TrialPaymentMethodSetupOperation = {
      ...operation,
      status: 'processing',
      claimId,
      claimedAt: new Date(claimedAt),
    };
    this.bySessionId.set(sessionId, claimed);
    return cloneOperation(claimed);
  }

  async markPaymentMethodAttached({
    sessionId,
    claimId,
    stripePaymentMethodId,
    attachedAt,
  }: MarkTrialPaymentMethodAttachedInput): Promise<void> {
    const operation = this.requireClaim(sessionId, claimId);
    this.bySessionId.set(sessionId, {
      ...operation,
      stripePaymentMethodId,
      paymentMethodAttachedAt: new Date(attachedAt),
    });
  }

  async markSubscriptionDefaultSet({
    sessionId,
    claimId,
    selectedAt,
  }: MarkTrialSubscriptionDefaultSetInput): Promise<void> {
    const operation = this.requireClaim(sessionId, claimId);
    this.bySessionId.set(sessionId, {
      ...operation,
      subscriptionDefaultSetAt: new Date(selectedAt),
    });
  }

  async markCompleted({
    sessionId,
    claimId,
    completedAt,
  }: CompleteTrialPaymentMethodSetupOperationInput): Promise<void> {
    const operation = this.requireClaim(sessionId, claimId);
    this.bySessionId.set(sessionId, {
      ...operation,
      status: 'completed',
      completedAt: new Date(completedAt),
    });
  }

  private requireClaim(
    sessionId: string,
    claimId: string,
  ): TrialPaymentMethodSetupOperation {
    const operation = this.bySessionId.get(sessionId);
    if (operation?.status !== 'processing' || operation.claimId !== claimId) {
      throw new ApplicationError(
        'CONFLICT',
        'Trial payment-method setup operation is not owned by this claim',
      );
    }
    return operation;
  }
}
