import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { practiceSessions } from '@/db/schema';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// DEBT-465 Part 3, rule R17: one start-session idempotency key yields exactly
// one session, even when two requests carrying it overlap on real Postgres.
const first = createIntegrationDb();
const second = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(first.db, cleanup);
});

afterAll(async () => {
  await closeConnection(second.sql);
  await closeConnection(first.sql);
});

describe('start-session idempotency on real Postgres', () => {
  it('starts one session for two overlapping requests with one key, and both receive it', async () => {
    const user = await createUser(first.db, cleanup);
    const question = await createQuestion(first.db, cleanup, {
      slug: `it-start-idempotency-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const key = randomUUID();
    const entered = createDeferred<void>();
    const refused = createDeferred<void>();
    const release = createDeferred<void>();
    let executions = 0;

    // The second request's claim is refused while the first holds the key.
    class ObservedRepository extends DrizzleIdempotencyKeyRepository {
      override async claim(
        input: Parameters<DrizzleIdempotencyKeyRepository['claim']>[0],
      ) {
        const claimedAt = await super.claim(input);
        if (claimedAt === null) refused.resolve();
        return claimedAt;
      }
    }

    const start = (connection: typeof first) =>
      withIdempotency({
        repo: new ObservedRepository(connection.db),
        logger: new FakeLogger(),
        userId: user.id,
        action: 'practice:startPracticeSession',
        key,
        now: () => new Date(),
        pollIntervalMs: 10,
        execute: async () => {
          executions += 1;
          entered.resolve();
          await release.promise;
          const session = await new DrizzlePracticeSessionRepository(
            connection.db,
          ).create({
            userId: user.id,
            mode: 'tutor',
            paramsJson: {
              count: 1,
              tagSlugs: [],
              difficulties: [],
              questionIds: [question.id],
            },
          });
          return { sessionId: session.id };
        },
      });

    const firstResult = start(first);
    await entered.promise;
    const secondResult = start(second);
    await refused.promise;
    release.resolve();

    const [a, b] = await Promise.all([firstResult, secondResult]);
    expect(executions).toBe(1);
    expect(b).toEqual(a);
    await expect(
      first.db
        .select({ id: practiceSessions.id })
        .from(practiceSessions)
        .where(eq(practiceSessions.userId, user.id)),
    ).resolves.toEqual([{ id: a.sessionId }]);
  });
});
