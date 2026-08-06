import { describe, expect, it } from 'vitest';
import { FakeTrialPaymentMethodSetupOperationRepository } from './fake-trial-payment-method-setup-operation-repository';

const pendingInput = {
  sessionId: 'cs_setup_123',
  userId: 'user_1',
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: 'sub_123',
  plan: 'monthly' as const,
  amountCents: 2900,
  currency: 'usd' as const,
  frequency: 'month' as const,
  trialEndsAt: new Date('2026-08-13T12:00:00Z'),
  disclosureSnapshot: 'Exact disclosure.',
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'terms-hash',
};

describe('FakeTrialPaymentMethodSetupOperationRepository', () => {
  it('persists and replays the exact pending snapshot by Checkout Session id', async () => {
    const repository = new FakeTrialPaymentMethodSetupOperationRepository();

    await repository.createPending(pendingInput);
    await repository.createPending(pendingInput);

    await expect(repository.findBySessionId('cs_setup_123')).resolves.toEqual(
      expect.objectContaining({
        ...pendingInput,
        status: 'pending',
        paymentMethodAttachedAt: null,
        subscriptionDefaultSetAt: null,
      }),
    );
  });

  it('rejects a Checkout Session replay whose immutable snapshot changed', async () => {
    const repository = new FakeTrialPaymentMethodSetupOperationRepository();
    await repository.createPending(pendingInput);

    await expect(
      repository.createPending({
        ...pendingInput,
        amountCents: 19900,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows only one of two concurrent workers to claim a pending operation', async () => {
    const repository = new FakeTrialPaymentMethodSetupOperationRepository();
    await repository.createPending(pendingInput);
    const now = new Date('2026-08-06T12:00:00Z');

    const [first, second] = await Promise.all([
      repository.claim('cs_setup_123', 'claim_1', now, new Date(0)),
      repository.claim('cs_setup_123', 'claim_2', now, new Date(0)),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect([first?.claimId, second?.claimId].filter(Boolean)).toEqual([
      'claim_1',
    ]);
  });

  it('reclaims an expired processing lease without erasing per-write progress', async () => {
    const repository = new FakeTrialPaymentMethodSetupOperationRepository();
    await repository.createPending(pendingInput);
    await repository.claim(
      'cs_setup_123',
      'claim_1',
      new Date('2026-08-06T10:00:00Z'),
      new Date(0),
    );
    await repository.markPaymentMethodAttached(
      'cs_setup_123',
      'claim_1',
      'pm_123',
      new Date('2026-08-06T10:00:01Z'),
    );

    const reclaimed = await repository.claim(
      'cs_setup_123',
      'claim_2',
      new Date('2026-08-06T11:00:00Z'),
      new Date('2026-08-06T10:55:00Z'),
    );

    expect(reclaimed).toEqual(
      expect.objectContaining({
        claimId: 'claim_2',
        stripePaymentMethodId: 'pm_123',
        paymentMethodAttachedAt: new Date('2026-08-06T10:00:01Z'),
        subscriptionDefaultSetAt: null,
      }),
    );
  });

  it('restores an isolated transaction snapshot', async () => {
    const repository = new FakeTrialPaymentMethodSetupOperationRepository();
    await repository.createPending(pendingInput);
    const snapshot = repository.snapshot();
    await repository.claim(
      'cs_setup_123',
      'claim_1',
      new Date('2026-08-06T10:00:00Z'),
      new Date(0),
    );

    repository.restore(snapshot);

    await expect(repository.findBySessionId('cs_setup_123')).resolves.toEqual(
      expect.objectContaining({ status: 'pending', claimId: null }),
    );
  });
});
