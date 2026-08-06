import { describe, expect, it, vi } from 'vitest';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from './drizzle-trial-payment-method-setup-operation-repository';

type RepoDb = ConstructorParameters<
  typeof DrizzleTrialPaymentMethodSetupOperationRepository
>[0];

const pendingInput = {
  sessionId: 'cs_setup_123',
  userId: crypto.randomUUID(),
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

function createDbMock(input?: {
  insertRows?: unknown[];
  updateRows?: unknown[];
  existingRow?: unknown;
}) {
  const insertReturning = vi.fn(async () => input?.insertRows ?? [{}]);
  const onConflictDoNothing = vi.fn(() => ({ returning: insertReturning }));
  const insertValues = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn(async () => input?.updateRows ?? []);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const findFirst = vi.fn(async () => input?.existingRow ?? null);
  const db = {
    insert,
    update,
    query: {
      trialPaymentMethodSetupOperations: { findFirst },
    },
  };

  return {
    db: db as unknown as RepoDb,
    insertValues,
    updateSet,
    findFirst,
  };
}

describe('DrizzleTrialPaymentMethodSetupOperationRepository', () => {
  it('inserts the immutable pending snapshot', async () => {
    const { db, insertValues } = createDbMock();
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );

    await repository.createPending(pendingInput);

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        ...pendingInput,
        status: 'pending',
      }),
    );
  });

  it('rejects a conflicting replay of the same Checkout Session', async () => {
    const { db } = createDbMock({
      insertRows: [],
      existingRow: {
        ...pendingInput,
        amountCents: 19900,
        status: 'pending',
        claimId: null,
        claimedAt: null,
        stripePaymentMethodId: null,
        paymentMethodAttachedAt: null,
        subscriptionDefaultSetAt: null,
        completedAt: null,
      },
    });
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );

    await expect(repository.createPending(pendingInput)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('returns the row claimed by the conditional pending-or-stale update', async () => {
    const claimedAt = new Date('2026-08-06T12:00:00Z');
    const claimedRow = {
      ...pendingInput,
      status: 'processing',
      claimId: 'claim_1',
      claimedAt,
      stripePaymentMethodId: null,
      paymentMethodAttachedAt: null,
      subscriptionDefaultSetAt: null,
      completedAt: null,
    };
    const { db, updateSet } = createDbMock({ updateRows: [claimedRow] });
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );

    await expect(
      repository.claim(
        'cs_setup_123',
        'claim_1',
        claimedAt,
        new Date('2026-08-06T11:55:00Z'),
      ),
    ).resolves.toEqual(claimedRow);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        claimId: 'claim_1',
        claimedAt,
      }),
    );
  });
});
