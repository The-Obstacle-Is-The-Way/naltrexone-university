import type { SubscriptionPlan } from '@/src/domain/value-objects';

export type TrialPaymentMethodSetupOperationStatus =
  | 'pending'
  | 'processing'
  | 'completed';

export type TrialPaymentMethodSetupOperationInput = {
  sessionId: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: SubscriptionPlan;
  amountCents: number;
  currency: 'usd';
  frequency: 'month' | 'year';
  trialEndsAt: Date;
  disclosureSnapshot: string;
  disclosureVersion: string;
  termsVersion: string;
  termsHash: string;
};

export type TrialPaymentMethodSetupOperation =
  TrialPaymentMethodSetupOperationInput & {
    status: TrialPaymentMethodSetupOperationStatus;
    claimId: string | null;
    claimedAt: Date | null;
    stripePaymentMethodId: string | null;
    paymentMethodAttachedAt: Date | null;
    subscriptionDefaultSetAt: Date | null;
    completedAt: Date | null;
  };

export interface TrialPaymentMethodSetupOperationRepository {
  createPending(input: TrialPaymentMethodSetupOperationInput): Promise<void>;
  findBySessionId(
    sessionId: string,
  ): Promise<TrialPaymentMethodSetupOperation | null>;
  claim(
    sessionId: string,
    claimId: string,
    claimedAt: Date,
    staleBefore: Date,
  ): Promise<TrialPaymentMethodSetupOperation | null>;
  markPaymentMethodAttached(
    sessionId: string,
    claimId: string,
    stripePaymentMethodId: string,
    attachedAt: Date,
  ): Promise<void>;
  markSubscriptionDefaultSet(
    sessionId: string,
    claimId: string,
    selectedAt: Date,
  ): Promise<void>;
  markCompleted(
    sessionId: string,
    claimId: string,
    completedAt: Date,
  ): Promise<void>;
}
