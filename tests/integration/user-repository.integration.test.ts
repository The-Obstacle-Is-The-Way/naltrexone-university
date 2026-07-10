import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { ClerkAuthGateway } from '@/src/adapters/gateways/clerk-auth-gateway';
import { DrizzleUserRepository } from '@/src/adapters/repositories/drizzle-user-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

function createScriptedNow(...timestamps: Date[]) {
  if (timestamps.length === 0) {
    return () => {
      throw new Error('Expected at least one scripted timestamp');
    };
  }

  let index = 0;

  return () => {
    if (index >= timestamps.length) {
      throw new Error(
        `Scripted now() exhausted after ${timestamps.length} call(s)`,
      );
    }

    const value = timestamps[index];
    if (value === undefined) {
      throw new Error(
        `Scripted now() exhausted after ${timestamps.length} call(s)`,
      );
    }
    index += 1;
    return value;
  };
}

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleUserRepository', () => {
  it('throws when scripted time is drawn more times than configured', () => {
    const observedAt = new Date('2026-02-01T00:00:00.000Z');
    const now = createScriptedNow(observedAt);

    expect(now()).toBe(observedAt);
    expect(() => now()).toThrowError(
      'Scripted now() exhausted after 1 call(s)',
    );
  });

  it('upserts users by clerk id and can find them', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const email = `it-${randomUUID()}@example.com`;

    const user = await repo.upsertByClerkId(clerkUserId, email);
    cleanup.userIds.push(user.id);

    await expect(repo.findByClerkId(clerkUserId)).resolves.toMatchObject({
      id: user.id,
      email,
    });
  });

  it('locks and returns an existing user inside a transaction', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const email = `it-${randomUUID()}@example.com`;

    const user = await repo.upsertByClerkId(clerkUserId, email);
    cleanup.userIds.push(user.id);

    await db.transaction(async (tx) => {
      const txRepo = new DrizzleUserRepository(tx);

      await expect(txRepo.lockByClerkId(clerkUserId)).resolves.toMatchObject({
        id: user.id,
        email,
      });
    });
  });

  it('applies observedAt clock-guard semantics when upserting', async () => {
    const repo = new DrizzleUserRepository(db);
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const email1 = `it-${randomUUID()}@example.com`;
    const first = await repo.upsertByClerkId(clerkUserId, email1, {
      observedAt: t1,
    });
    cleanup.userIds.push(first.id);

    const t0 = new Date('2026-01-31T23:00:00.000Z');
    const email2 = `it-${randomUUID()}@example.com`;
    const stale = await repo.upsertByClerkId(clerkUserId, email2, {
      observedAt: t0,
    });
    expect(stale).toMatchObject({
      id: first.id,
      email: email1,
      createdAt: t1,
      updatedAt: t1,
    });

    const t2 = new Date('2026-02-01T01:00:00.000Z');
    const updated = await repo.upsertByClerkId(clerkUserId, email2, {
      observedAt: t2,
    });
    expect(updated).toMatchObject({
      id: first.id,
      email: email2,
      createdAt: t1,
      updatedAt: t2,
    });

    const t3 = new Date('2026-02-01T02:00:00.000Z');
    const bumped = await repo.upsertByClerkId(clerkUserId, email2, {
      observedAt: t3,
    });
    expect(bumped).toMatchObject({
      id: first.id,
      email: email2,
      createdAt: t1,
      updatedAt: t3,
    });
  });

  it('updates email when upserting an existing user', async () => {
    const firstObservedAt = new Date('2026-02-01T00:00:00.000Z');
    const secondObservedAt = new Date('2026-02-01T00:00:01.000Z');
    const repo = new DrizzleUserRepository(
      db,
      createScriptedNow(firstObservedAt, secondObservedAt),
    );
    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;

    const first = await repo.upsertByClerkId(
      clerkUserId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(first.id);

    const secondEmail = `it-${randomUUID()}@example.com`;
    const second = await repo.upsertByClerkId(clerkUserId, secondEmail);

    expect(second).toMatchObject({
      id: first.id,
      email: secondEmail,
      createdAt: firstObservedAt,
      updatedAt: secondObservedAt,
    });
  });

  it('rejects a different Clerk identity for an existing email without reassigning the row', async () => {
    const firstObservedAt = new Date('2026-02-01T00:00:00.000Z');
    const secondObservedAt = new Date('2026-02-01T00:00:01.000Z');
    const repo = new DrizzleUserRepository(
      db,
      createScriptedNow(firstObservedAt, secondObservedAt),
    );
    const email = `it-${randomUUID()}@example.com`;
    const clerkId1 = `user_${randomUUID().replaceAll('-', '')}`;
    const clerkId2 = `user_${randomUUID().replaceAll('-', '')}`;

    const first = await repo.upsertByClerkId(clerkId1, email);
    cleanup.userIds.push(first.id);

    await expect(repo.upsertByClerkId(clerkId2, email)).rejects.toMatchObject({
      code: 'CONFLICT',
      existingClerkUserId: clerkId1,
      details: {
        reason: 'user_email_owned_by_another_identity',
      },
    });

    await expect(repo.findByClerkId(clerkId1)).resolves.toMatchObject({
      id: first.id,
      email,
      createdAt: firstObservedAt,
    });
    await expect(repo.findByClerkId(clerkId2)).resolves.toBeNull();
  });

  it('rejects stale cross-identity observations instead of returning the existing identity', async () => {
    const repo = new DrizzleUserRepository(db);
    const email = `it-${randomUUID()}@example.com`;
    const clerkId1 = `user_${randomUUID().replaceAll('-', '')}`;
    const clerkId2 = `user_${randomUUID().replaceAll('-', '')}`;
    const t2 = new Date('2026-02-01T02:00:00.000Z');
    const t1 = new Date('2026-02-01T01:00:00.000Z');

    const first = await repo.upsertByClerkId(clerkId1, email, {
      observedAt: t2,
    });
    cleanup.userIds.push(first.id);

    await expect(
      repo.upsertByClerkId(clerkId2, email, {
        observedAt: t1,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      existingClerkUserId: clerkId1,
    });

    await expect(repo.findByClerkId(clerkId1)).resolves.toMatchObject({
      id: first.id,
      email,
    });
    await expect(repo.findByClerkId(clerkId2)).resolves.toBeNull();
  });

  it('keeps an outer transaction usable after classifying an email conflict', async () => {
    const repo = new DrizzleUserRepository(db);
    const email = `it-${randomUUID()}@example.com`;
    const existingClerkId = `user_${randomUUID().replaceAll('-', '')}`;
    const incomingClerkId = `user_${randomUUID().replaceAll('-', '')}`;
    const existing = await repo.upsertByClerkId(existingClerkId, email);
    const incoming = await repo.upsertByClerkId(
      incomingClerkId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(existing.id);
    cleanup.userIds.push(incoming.id);

    await db.transaction(async (tx) => {
      const txRepo = new DrizzleUserRepository(tx);
      let caught: unknown;

      try {
        await txRepo.upsertByClerkId(incomingClerkId, email);
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        code: 'CONFLICT',
        existingClerkUserId: existingClerkId,
        details: {
          reason: 'user_email_owned_by_another_identity',
        },
      });
      await expect(
        txRepo.findByClerkId(existingClerkId),
      ).resolves.toMatchObject({
        id: existing.id,
        email,
      });
      await expect(
        txRepo.findByClerkId(incomingClerkId),
      ).resolves.toMatchObject({
        id: incoming.id,
        email: incoming.email,
      });
    });
  });

  it('synchronizes a moved owner before creating a distinct incoming identity on the raw-db path', async () => {
    const repo = new DrizzleUserRepository(db);
    const logger = new FakeLogger();
    const reusedEmail = `it-${randomUUID()}@example.com`;
    const movedEmail = `it-${randomUUID()}@example.com`;
    const existingClerkId = `user_${randomUUID().replaceAll('-', '')}`;
    const incomingClerkId = `user_${randomUUID().replaceAll('-', '')}`;
    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-01T01:00:00.000Z');
    const t3 = new Date('2026-02-01T02:00:00.000Z');
    const existing = await repo.upsertByClerkId(existingClerkId, reusedEmail, {
      observedAt: t1,
    });
    cleanup.userIds.push(existing.id);
    const question = await createQuestion(db, cleanup, {
      slug: `bug-284-${randomUUID()}`,
      status: 'published',
      difficulty: 'medium',
    });
    await db.insert(schema.stripeCustomers).values({
      userId: existing.id,
      stripeCustomerId: `cus_${randomUUID().replaceAll('-', '')}`,
    });
    await db.insert(schema.stripeSubscriptions).values({
      userId: existing.id,
      stripeSubscriptionId: `sub_${randomUUID().replaceAll('-', '')}`,
      status: 'active',
      priceId: 'price_bug_284',
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    });
    await db.insert(schema.bookmarks).values({
      userId: existing.id,
      questionId: question.id,
    });
    await db.insert(schema.attempts).values({
      userId: existing.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
    const deps = {
      userRepository: repo,
      logger,
      getClerkUser: async () => ({
        id: incomingClerkId,
        updatedAt: t3.getTime(),
        emailAddresses: [{ emailAddress: reusedEmail }],
      }),
      getClerkUserById: async (clerkUserId: string) =>
        clerkUserId === existingClerkId
          ? {
              id: existingClerkId,
              updatedAt: t2.getTime(),
              emailAddresses: [{ emailAddress: movedEmail }],
            }
          : null,
    };
    const gateway = new ClerkAuthGateway(deps);

    const incoming = await gateway.requireUser();
    cleanup.userIds.push(incoming.id);

    expect(incoming.id).not.toBe(existing.id);
    await expect(repo.findByClerkId(existingClerkId)).resolves.toMatchObject({
      id: existing.id,
      email: movedEmail,
    });
    await expect(repo.findByClerkId(incomingClerkId)).resolves.toMatchObject({
      id: incoming.id,
      email: reusedEmail,
    });
    await expect(
      db.query.stripeCustomers.findFirst({
        where: eq(schema.stripeCustomers.userId, existing.id),
      }),
    ).resolves.toMatchObject({ userId: existing.id });
    await expect(
      db.query.stripeSubscriptions.findFirst({
        where: eq(schema.stripeSubscriptions.userId, existing.id),
      }),
    ).resolves.toMatchObject({ userId: existing.id });
    await expect(
      db.query.bookmarks.findFirst({
        where: eq(schema.bookmarks.userId, existing.id),
      }),
    ).resolves.toMatchObject({ userId: existing.id });
    await expect(
      db.query.attempts.findFirst({
        where: eq(schema.attempts.userId, existing.id),
      }),
    ).resolves.toMatchObject({ userId: existing.id });
    expect(logger.infoCalls).toEqual([
      {
        context: {
          existingClerkUserId: existingClerkId,
          incomingClerkUserId: incomingClerkId,
          resolution: 'existing_identity_email_synchronized',
        },
        msg: 'Resolved Clerk user email ownership conflict',
      },
    ]);
  });

  it('deletes by clerk id and returns false when missing', async () => {
    const repo = new DrizzleUserRepository(db);
    await expect(repo.deleteByClerkId('user_missing')).resolves.toBe(false);

    const clerkUserId = `user_${randomUUID().replaceAll('-', '')}`;
    const user = await repo.upsertByClerkId(
      clerkUserId,
      `it-${randomUUID()}@example.com`,
    );
    cleanup.userIds.push(user.id);

    await expect(repo.deleteByClerkId(clerkUserId)).resolves.toBe(true);
    await expect(repo.findByClerkId(clerkUserId)).resolves.toBeNull();
  });
});
