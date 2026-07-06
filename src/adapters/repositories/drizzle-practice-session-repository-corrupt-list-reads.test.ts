import { describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import {
  createStateRow,
  expectStateSelectPredicate,
  type StateRow,
} from './drizzle-practice-session-repository-test-helpers';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();

function createStateSelect(
  rows: readonly StateRow[],
  expectedSessionIds: readonly string[],
) {
  return vi.fn(() => ({
    from: () => ({
      where: (predicate: unknown) => {
        expectStateSelectPredicate(predicate, expectedSessionIds);
        return {
          orderBy: async () => rows,
        };
      },
    }),
  }));
}

function createRepeatableReadDb<TTx extends object>(tx: TTx) {
  const transaction = vi.fn(async (fn: (client: TTx) => Promise<unknown>) =>
    fn(tx),
  );
  const db = {
    transaction,
    query: {
      practiceSessions: {
        findFirst: () => {
          throw new Error('unexpected root findFirst');
        },
        findMany: () => {
          throw new Error('unexpected root findMany');
        },
      },
    },
    select: () => {
      throw new Error('unexpected root select');
    },
    insert: () => {
      throw new Error('unexpected insert');
    },
    update: () => {
      throw new Error('unexpected update');
    },
  } as const;

  type RepoDb = ConstructorParameters<
    typeof DrizzlePracticeSessionRepository
  >[0];
  return {
    db: db as unknown as RepoDb,
    transaction,
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function expectRepeatableReadTransaction(
  transaction: ReturnType<typeof vi.fn>,
) {
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: 'repeatable read',
  });
}

describe('DrizzlePracticeSessionRepository corrupt list reads', () => {
  it('skips and logs a corrupt latest incomplete session row', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const row = {
      id: sessionId,
      userId,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [questionId],
      },
      startedAt,
      endedAt: null,
    } as const;
    const tx = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
      },
      select: createStateSelect([], [sessionId]),
    } as const;
    const { db, transaction } = createRepeatableReadDb(tx);
    const logger = createLogger();
    const repo = new DrizzlePracticeSessionRepository(
      db,
      () => new Date('2026-02-01T00:00:00.000Z'),
      logger,
    );

    await expect(repo.findLatestIncompleteByUserId(userId)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        userId,
        mode: null,
        rowMode: 'exam',
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
      'Skipping corrupt incomplete practice session row',
    );
    expectRepeatableReadTransaction(transaction);
  });

  it('skips and logs corrupt completed session rows while preserving total', async () => {
    const endedAt = new Date('2026-02-02T00:00:00.000Z');
    const startedAt = new Date('2026-02-01T23:00:00.000Z');
    const row = {
      id: sessionId,
      userId,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [questionId],
      },
      startedAt,
      endedAt,
    } as const;
    const findMany = vi.fn().mockResolvedValue([row]);
    const countWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
    const stateSelect = createStateSelect(
      [
        createStateRow({
          practiceSessionId: sessionId,
          questionId: crypto.randomUUID(),
          position: 0,
        }),
      ],
      [sessionId],
    );
    const select = vi.fn((selection?: unknown) => {
      if (selection) {
        return {
          from: () => ({
            where: countWhere,
          }),
        };
      }

      return stateSelect();
    });
    const tx = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
          findMany,
        },
      },
      select,
    } as const;
    const { db, transaction } = createRepeatableReadDb(tx);
    const logger = createLogger();
    const repo = new DrizzlePracticeSessionRepository(
      db,
      () => new Date('2026-02-01T00:00:00.000Z'),
      logger,
    );

    await expect(repo.findCompletedByUserId(userId, 10, 0)).resolves.toEqual({
      rows: [],
      total: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        userId,
        mode: null,
        rowMode: 'tutor',
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
      'Skipping corrupt completed practice session row',
    );
    expectRepeatableReadTransaction(transaction);
  });
});
