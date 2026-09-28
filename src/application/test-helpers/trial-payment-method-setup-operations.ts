import type { TrialPaymentMethodSetupOperationRepository } from '@/src/application/ports/repositories';

export type TrialSetupOperationStage =
  | 'pending'
  | 'attached'
  | 'defaultSet'
  | 'completed';

/**
 * Drives one add-card operation through the repository's own lifecycle, up to
 * `stage`, so fake-backed and Postgres-backed tests seed the same states.
 */
export async function seedTrialSetupOperation(
  repo: TrialPaymentMethodSetupOperationRepository,
  input: {
    userId: string;
    stripeSubscriptionId: string;
    stage: TrialSetupOperationStage;
  },
): Promise<void> {
  const sessionId = `cs_seed_${crypto.randomUUID()}`;
  const at = new Date('2026-09-28T12:00:00Z');
  await repo.createPending({
    sessionId,
    userId: input.userId,
    stripeCustomerId: 'cus_seed',
    stripeSubscriptionId: input.stripeSubscriptionId,
    plan: 'monthly',
    amountCents: 2900,
    currency: 'usd',
    frequency: 'month',
    trialEndsAt: new Date('2026-10-03T12:00:00Z'),
    disclosureSnapshot: 'Exact disclosure.',
    disclosureVersion: '2026-09-28.2',
    termsVersion: '2026-09-16',
    termsHash: 'terms-hash',
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
  });
  if (input.stage === 'pending') return;

  const claimId = crypto.randomUUID();
  await repo.claim({ sessionId, claimId, claimedAt: at, staleBefore: at });
  await repo.markPaymentMethodAttached({
    sessionId,
    claimId,
    stripePaymentMethodId: 'pm_seed',
    attachedAt: at,
  });
  if (input.stage === 'attached') return;

  await repo.markSubscriptionDefaultSet({ sessionId, claimId, selectedAt: at });
  if (input.stage === 'defaultSet') return;

  await repo.markCompleted({ sessionId, claimId, completedAt: at });
}
