import { randomUUID } from 'node:crypto';
import { and, eq, like, lt } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { trialPaymentMethodSetupOperations } from '@/db/schema';
import { DrizzleTrialPaymentMethodSetupOperationRepository } from '@/src/adapters/repositories/drizzle-trial-payment-method-setup-operation-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const primary = createIntegrationDb();
const competing = createIntegrationDb();
const { db } = primary;
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await Promise.all([
    closeConnection(primary.sql),
    closeConnection(competing.sql),
  ]);
});

describe('trial payment-method setup operation persistence', () => {
  it('serializes two concurrent workers and preserves progress across stale-lease recovery', async () => {
    const user = await createUser(db, cleanup);
    const firstRepository =
      new DrizzleTrialPaymentMethodSetupOperationRepository(db);
    const secondRepository =
      new DrizzleTrialPaymentMethodSetupOperationRepository(competing.db);
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
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    });

    const claimedAt = new Date('2026-08-06T12:00:00Z');
    const [first, second] = await Promise.all([
      firstRepository.claim({
        sessionId: 'cs_setup_concurrent',
        claimId: 'claim_1',
        claimedAt,
        staleBefore: new Date(0),
      }),
      secondRepository.claim({
        sessionId: 'cs_setup_concurrent',
        claimId: 'claim_2',
        claimedAt,
        staleBefore: new Date(0),
      }),
    ]);
    const winner = first ?? second;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    if (!winner?.claimId) throw new Error('Expected one worker claim');

    await firstRepository.markPaymentMethodAttached({
      sessionId: 'cs_setup_concurrent',
      claimId: winner.claimId,
      stripePaymentMethodId: 'pm_123',
      attachedAt: new Date('2026-08-06T12:00:01Z'),
    });
    const recovered = await secondRepository.claim({
      sessionId: 'cs_setup_concurrent',
      claimId: 'claim_recovery',
      claimedAt: new Date('2026-08-06T13:00:00Z'),
      staleBefore: new Date('2026-08-06T12:55:00Z'),
    });

    expect(recovered).toEqual(
      expect.objectContaining({
        claimId: 'claim_recovery',
        stripePaymentMethodId: 'pm_123',
        paymentMethodAttachedAt: new Date('2026-08-06T12:00:01Z'),
        subscriptionDefaultSetAt: null,
      }),
    );

    await expect(
      firstRepository.markSubscriptionDefaultSet({
        sessionId: 'cs_setup_concurrent',
        claimId: winner.claimId,
        selectedAt: new Date('2026-08-06T13:00:01Z'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await secondRepository.markSubscriptionDefaultSet({
      sessionId: 'cs_setup_concurrent',
      claimId: 'claim_recovery',
      selectedAt: new Date('2026-08-06T13:00:01Z'),
    });
    await expect(
      firstRepository.markCompleted({
        sessionId: 'cs_setup_concurrent',
        claimId: winner.claimId,
        completedAt: new Date('2026-08-06T13:00:02Z'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      secondRepository.findBySessionId('cs_setup_concurrent'),
    ).resolves.toMatchObject({
      status: 'processing',
      claimId: 'claim_recovery',
      subscriptionDefaultSetAt: new Date('2026-08-06T13:00:01Z'),
      completedAt: null,
    });
  });

  it('expires and prunes abandoned setup operations without deleting completed operations', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    const base = {
      userId: user.id,
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
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    };
    await repository.createPending({ ...base, sessionId: 'cs_expired_old' });
    await repository.createPending({ ...base, sessionId: 'cs_expired_recent' });
    await repository.createPending({ ...base, sessionId: 'cs_completed' });
    await repository.markExpired({
      sessionId: 'cs_expired_old',
      expiredAt: new Date('2026-06-01T00:00:00Z'),
    });
    await repository.markExpired({
      sessionId: 'cs_expired_recent',
      expiredAt: new Date('2026-08-01T00:00:00Z'),
    });
    await repository.claim({
      sessionId: 'cs_completed',
      claimId: 'claim_completed',
      claimedAt: new Date('2026-06-01T00:00:00Z'),
      staleBefore: new Date(0),
    });
    await repository.markCompleted({
      sessionId: 'cs_completed',
      claimId: 'claim_completed',
      completedAt: new Date('2026-06-01T00:00:01Z'),
    });

    await expect(
      repository.pruneExpired({
        expiredBefore: new Date('2026-07-08T00:00:00Z'),
        limit: 100,
      }),
    ).resolves.toBe(1);
    await expect(
      repository.findBySessionId('cs_expired_old'),
    ).resolves.toBeNull();
    await expect(
      repository.findBySessionId('cs_expired_recent'),
    ).resolves.toMatchObject({ status: 'expired' });
    await expect(
      repository.findBySessionId('cs_completed'),
    ).resolves.toMatchObject({ status: 'completed' });
  });
});

describe('trial payment-method setup operation snapshots and outcomes', () => {
  function pendingInput(sessionId: string, userId: string) {
    return {
      sessionId,
      userId,
      stripeCustomerId: 'cus_snapshot',
      stripeSubscriptionId: 'sub_snapshot',
      plan: 'monthly' as const,
      amountCents: 2900,
      currency: 'usd' as const,
      frequency: 'month' as const,
      trialEndsAt: new Date('2026-08-13T12:00:00Z'),
      disclosureSnapshot: 'Exact disclosure.',
      disclosureVersion: '2026-08-05',
      termsVersion: '2026-08-05',
      termsHash: 'terms-hash',
      cancellationMethod:
        'Billing page in the app or support@addictionboards.com',
    };
  }

  it('stores the immutable pending snapshot and reads it back', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    const input = pendingInput(`cs_snapshot_${randomUUID()}`, user.id);

    await repository.createPending(input);

    await expect(repository.findBySessionId(input.sessionId)).resolves.toEqual(
      expect.objectContaining({
        ...input,
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
      }),
    );
  });

  it('resolves an identical createPending replay for the same Checkout Session', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    const input = pendingInput(`cs_replay_${randomUUID()}`, user.id);
    await repository.createPending(input);

    await expect(repository.createPending(input)).resolves.toBeUndefined();
  });

  it('throws CONFLICT when a replay changes the snapshot', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    const input = pendingInput(`cs_changed_${randomUUID()}`, user.id);
    await repository.createPending(input);

    await expect(
      repository.createPending({ ...input, amountCents: 3900 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  async function claimedOperation(
    repository: DrizzleTrialPaymentMethodSetupOperationRepository,
  ) {
    const user = await createUser(db, cleanup);
    const input = pendingInput(`cs_terminal_${randomUUID()}`, user.id);
    await repository.createPending(input);
    const claimed = await repository.claim({
      sessionId: input.sessionId,
      claimId: 'claim_terminal',
      claimedAt: new Date('2026-08-06T12:00:00Z'),
      staleBefore: new Date(0),
    });
    if (!claimed) throw new Error('Expected the claim to succeed');
    return input;
  }

  it('rejects markTerminal from a claim that no longer holds the operation', async () => {
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    const input = await claimedOperation(repository);

    await expect(
      repository.markTerminal({
        sessionId: input.sessionId,
        claimId: 'claim_stale',
        reason: 'billing_ownership_mismatch',
        terminalAt: new Date('2026-08-06T12:05:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(repository.findBySessionId(input.sessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'processing',
        claimId: 'claim_terminal',
        terminalReason: null,
      }),
    );
  });

  it('persists the terminal reason and time for the holding claim', async () => {
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    const input = await claimedOperation(repository);
    const terminalAt = new Date('2026-08-06T12:05:00Z');

    await repository.markTerminal({
      sessionId: input.sessionId,
      claimId: 'claim_terminal',
      reason: 'billing_ownership_mismatch',
      terminalAt,
    });

    await expect(repository.findBySessionId(input.sessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'terminal',
        terminalReason: 'billing_ownership_mismatch',
        terminalAt,
      }),
    );
  });

  it('prunes expired operations oldest first, up to the limit', async () => {
    const user = await createUser(db, cleanup);
    const repository = new DrizzleTrialPaymentMethodSetupOperationRepository(
      db,
    );
    // The prune is table-wide by design, so the two rows sit in a far-past
    // window that no service or other test writes: foreign expired rows can
    // never be eligible ahead of them, even against an existing database.
    // Only this case's own rows in that window are cleared first (an aborted
    // earlier run can leave them behind); the delete is scoped by the window
    // and by the session-id prefix this case alone creates, so an unrelated
    // row there is never deleted and would instead fail the case below.
    const olderExpiredAt = new Date('1970-01-01T00:00:00Z');
    const newerExpiredAt = new Date('1970-01-01T00:00:01Z');
    const expiredBefore = new Date('1970-01-01T00:00:02Z');
    await db
      .delete(trialPaymentMethodSetupOperations)
      .where(
        and(
          eq(trialPaymentMethodSetupOperations.status, 'expired'),
          lt(trialPaymentMethodSetupOperations.expiredAt, expiredBefore),
          like(trialPaymentMethodSetupOperations.sessionId, 'cs_prune_%'),
        ),
      );
    const older = pendingInput(`cs_prune_older_${randomUUID()}`, user.id);
    const newer = pendingInput(`cs_prune_newer_${randomUUID()}`, user.id);
    await repository.createPending(older);
    await repository.createPending(newer);
    await repository.markExpired({
      sessionId: older.sessionId,
      expiredAt: olderExpiredAt,
    });
    await repository.markExpired({
      sessionId: newer.sessionId,
      expiredAt: newerExpiredAt,
    });

    await expect(
      repository.pruneExpired({ expiredBefore, limit: 1 }),
    ).resolves.toBe(1);

    await expect(
      repository.findBySessionId(older.sessionId),
    ).resolves.toBeNull();
    await expect(repository.findBySessionId(newer.sessionId)).resolves.toEqual(
      expect.objectContaining({ status: 'expired' }),
    );
  });
});
