import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('trial payment-method setup operation persistence', () => {
  it('serializes two concurrent workers and preserves progress across stale-lease recovery', async () => {
    const user = await createUser(db, cleanup);
    const firstRepository =
      new DrizzleTrialPaymentMethodSetupOperationRepository(db);
    const secondRepository =
      new DrizzleTrialPaymentMethodSetupOperationRepository(db);
    await firstRepository.createPending({
      sessionId: 'cs_setup_concurrent',
      userId: user.id,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      amountCents: 2900,
      currency: 'usd',
      frequency: 'month',
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
    });

    const claimedAt = new Date('2026-08-06T12:00:00Z');
    const [first, second] = await Promise.all([
      firstRepository.claim(
        'cs_setup_concurrent',
        'claim_1',
        claimedAt,
        new Date(0),
      ),
      secondRepository.claim(
        'cs_setup_concurrent',
        'claim_2',
        claimedAt,
        new Date(0),
      ),
    ]);
    const winner = first ?? second;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    if (!winner?.claimId) throw new Error('Expected one worker claim');

    await firstRepository.markPaymentMethodAttached(
      'cs_setup_concurrent',
      winner.claimId,
      'pm_123',
      new Date('2026-08-06T12:00:01Z'),
    );
    const recovered = await secondRepository.claim(
      'cs_setup_concurrent',
      'claim_recovery',
      new Date('2026-08-06T13:00:00Z'),
      new Date('2026-08-06T12:55:00Z'),
    );

    expect(recovered).toEqual(
      expect.objectContaining({
        claimId: 'claim_recovery',
        stripePaymentMethodId: 'pm_123',
        paymentMethodAttachedAt: new Date('2026-08-06T12:00:01Z'),
        subscriptionDefaultSetAt: null,
      }),
    );
  });
});
