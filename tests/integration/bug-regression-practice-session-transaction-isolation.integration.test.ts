import { randomUUID } from 'node:crypto';
import { sql as drizzleSql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createContainer } from '@/lib/container';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
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

function observeTransactionIsolation(input: {
  observedIsolationLevels: string[];
}): DrizzleDb {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'transaction') {
        return Reflect.get(target, property, receiver);
      }

      return async <T>(
        fn: (tx: DrizzleDb) => Promise<T>,
        config?: Parameters<DrizzleDb['transaction']>[1],
      ): Promise<T> =>
        db.transaction(async (tx) => {
          const rows = await tx.execute<{ transaction_isolation: string }>(
            drizzleSql`SHOW transaction_isolation`,
          );
          const isolationLevel = rows[0]?.transaction_isolation;
          if (isolationLevel) {
            input.observedIsolationLevels.push(isolationLevel);
          }
          return fn(tx as unknown as DrizzleDb);
        }, config);
    },
  }) as DrizzleDb;
}

describe('BUG-267 practice-session transaction isolation', () => {
  it('opens the finalize exam write transaction at repeatable read in the real driver', async () => {
    const observedIsolationLevels: string[] = [];
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-finalize-isolation-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const now = new Date('2026-06-30T12:01:00.000Z');
    const container = createContainer({
      primitives: {
        db: observeTransactionIsolation({ observedIsolationLevels }),
        env: {
          NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
          NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
          STRIPE_WEBHOOK_SECRET: 'whsec',
          NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        } as unknown as typeof import('@/lib/env').env,
        logger:
          new FakeLogger() as unknown as typeof import('@/lib/logger').logger,
        getStripe: () =>
          ({}) as unknown as ReturnType<
            typeof import('@/lib/stripe').getStripe
          >,
        now: () => now,
      },
    });
    const session = await container.createPracticeSessionRepository().create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    observedIsolationLevels.length = 0;
    await container.createFinalizeExamAnswersUseCase().execute({
      userId: user.id,
      sessionId: session.id,
    });

    expect(observedIsolationLevels).toContain('repeatable read');
    expect(observedIsolationLevels).not.toContain('read committed');
  });
});
