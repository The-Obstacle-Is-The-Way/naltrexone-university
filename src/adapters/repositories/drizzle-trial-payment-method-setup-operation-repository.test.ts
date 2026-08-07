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
  cancellationMethod: 'Billing page in the app or support@addictionboards.com',
};

function createDbMock(input?: {
  insertRows?: unknown[];
  updateRows?: unknown[];
  existingRow?: unknown;
  selectRows?: unknown[];
  deleteRows?: unknown[];
}) {
  const insertReturning = vi.fn(async () => input?.insertRows ?? [{}]);
  const onConflictDoNothing = vi.fn(() => ({ returning: insertReturning }));
  const insertValues = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn(async () => input?.updateRows ?? []);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectLimit = vi.fn(async () => input?.selectRows ?? []);
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const deleteReturning = vi.fn(async () => input?.deleteRows ?? []);
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));

  const findFirst = vi.fn(async () => input?.existingRow ?? null);
  const db = {
    insert,
    update,
    select,
    delete: deleteFrom,
    query: {
      trialPaymentMethodSetupOperations: { findFirst },
    },
  };

  return {
    db: db as unknown as RepoDb,
    insertValues,
    updateSet,
    deleteReturning,
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
        terminalAt: null,
        terminalReason: null,
        expiredAt: null,
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
      terminalAt: null,
      terminalReason: null,
      expiredAt: null,
    };
    const { db, updateSet } = createDbMock({ updateRows: [claimedRow] });
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );

    await expect(
      repository.claim({
        sessionId: 'cs_setup_123',
        claimId: 'claim_1',
        claimedAt,
        staleBefore: new Date('2026-08-06T11:55:00Z'),
      }),
    ).resolves.toEqual(claimedRow);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        claimId: 'claim_1',
        claimedAt,
      }),
    );
  });

  it('persists terminal and expired lifecycle outcomes', async () => {
    const lifecycleRow = {
      ...pendingInput,
      status: 'terminal',
      claimId: 'claim_1',
      claimedAt: new Date('2026-08-07T12:00:00Z'),
      stripePaymentMethodId: null,
      paymentMethodAttachedAt: null,
      subscriptionDefaultSetAt: null,
      completedAt: null,
      terminalAt: new Date('2026-08-07T12:00:01Z'),
      terminalReason: 'billing_ownership_mismatch',
      expiredAt: null,
    };
    const { db, updateSet } = createDbMock({ updateRows: [lifecycleRow] });
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );

    await repository.markTerminal({
      sessionId: 'cs_setup_123',
      claimId: 'claim_1',
      reason: 'billing_ownership_mismatch',
      terminalAt: new Date('2026-08-07T12:00:01Z'),
    });
    await expect(
      repository.markExpired({
        sessionId: 'cs_setup_123',
        expiredAt: new Date('2026-08-08T12:00:00Z'),
      }),
    ).resolves.toBe(true);

    expect(updateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'terminal',
        terminalReason: 'billing_ownership_mismatch',
      }),
    );
    expect(updateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'expired',
        expiredAt: new Date('2026-08-08T12:00:00Z'),
      }),
    );
  });

  it('deletes only the selected expired operation ids', async () => {
    const { db, deleteReturning } = createDbMock({
      selectRows: [{ sessionId: 'cs_expired_1' }],
      deleteRows: [{ sessionId: 'cs_expired_1' }],
    });
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );

    await expect(
      repository.pruneExpired({
        expiredBefore: new Date('2026-07-08T00:00:00Z'),
        limit: 100,
      }),
    ).resolves.toBe(1);
    expect(deleteReturning).toHaveBeenCalledOnce();
  });
});
