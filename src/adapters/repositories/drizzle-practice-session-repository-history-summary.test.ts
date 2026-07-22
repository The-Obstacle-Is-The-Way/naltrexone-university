import { describe, expect, it, vi } from 'vitest';
import { practiceSessions } from '@/db/schema';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

type RepoDb = ConstructorParameters<typeof DrizzlePracticeSessionRepository>[0];

const userId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const firstQuestionId = crypto.randomUUID();
const secondQuestionId = crypto.randomUUID();
const startedAt = new Date('2026-07-20T10:00:00.000Z');
const endedAt = new Date('2026-07-20T10:05:00.000Z');

function createDb(summaryRows: readonly Record<string, unknown>[]) {
  const summaryOffset = vi.fn().mockResolvedValue(summaryRows);
  const summaryLimit = vi.fn(() => ({ offset: summaryOffset }));
  const summaryOrderBy = vi.fn(() => ({ limit: summaryLimit }));
  const summaryGroupBy = vi.fn(() => ({ orderBy: summaryOrderBy }));
  const summaryWhere = vi.fn(() => ({ groupBy: summaryGroupBy }));
  const secondLeftJoin = vi.fn(() => ({ where: summaryWhere }));
  const firstLeftJoin = vi.fn(() => ({ leftJoin: secondLeftJoin }));
  const summaryFrom = vi.fn(() => ({ leftJoin: firstLeftJoin }));

  const countWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
  const countFrom = vi.fn(() => ({ where: countWhere }));

  const select = vi
    .fn()
    .mockImplementationOnce(() => ({ from: countFrom }))
    .mockImplementationOnce(() => ({ from: summaryFrom }));
  const tx = { select };
  const transaction = vi.fn(
    async (action: (input: typeof tx) => Promise<unknown>) => action(tx),
  );

  return {
    db: { transaction } as unknown as RepoDb,
    select,
    summaryGroupBy,
    transaction,
  };
}

function createSummaryRow(
  orderedQuestionIds: readonly string[] = [firstQuestionId, secondQuestionId],
  orderedPositions: readonly number[] = [0, 1],
) {
  return {
    id: sessionId,
    userId,
    mode: 'exam' as const,
    paramsJson: {
      count: 2,
      tagSlugs: [],
      difficulties: [],
      questionIds: [firstQuestionId, secondQuestionId],
    },
    startedAt,
    endedAt,
    orderedQuestionIds,
    orderedPositions,
    answered: 1,
    correct: 1,
    firstQuestionSlug: 'first-question',
  };
}

describe('DrizzlePracticeSessionRepository history summaries', () => {
  it('returns one consumer-shaped summary row for an aggregated session', async () => {
    const { db, select, summaryGroupBy, transaction } = createDb([
      createSummaryRow(),
    ]);
    const repo = new DrizzlePracticeSessionRepository(db);

    await expect(
      repo.findCompletedHistorySummariesByUserId(userId, 10, 0),
    ).resolves.toEqual({
      rows: [
        {
          sessionId,
          mode: 'exam',
          questionCount: 2,
          firstQuestionSlug: 'first-question',
          answered: 1,
          correct: 1,
          startedAt,
          endedAt,
        },
      ],
      total: 1,
    });

    const summarySelection = select.mock.calls[1]?.[0];
    expect(Object.keys(summarySelection ?? {}).sort()).toEqual([
      'answered',
      'correct',
      'endedAt',
      'firstQuestionSlug',
      'id',
      'mode',
      'orderedPositions',
      'orderedQuestionIds',
      'paramsJson',
      'startedAt',
      'userId',
    ]);
    expect(summaryGroupBy).toHaveBeenCalledWith(practiceSessions.id);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('skips and logs a summary whose ordered state IDs drift from params_json', async () => {
    const { db } = createDb([
      createSummaryRow([secondQuestionId, firstQuestionId]),
    ]);
    const logger = new FakeLogger();
    const repo = new DrizzlePracticeSessionRepository(
      db,
      () => new Date(),
      logger,
    );

    await expect(
      repo.findCompletedHistorySummariesByUserId(userId, 10, 0),
    ).resolves.toEqual({ rows: [], total: 1 });
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          sessionId,
          mode: null,
          rowMode: 'exam',
          error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        }),
        msg: 'Skipping corrupt completed practice session row',
      }),
    ]);
    expect(logger.warnCalls[0]?.context).not.toHaveProperty('userId');
  });

  it('skips a summary whose normalized positions do not start at zero', async () => {
    const { db } = createDb([
      createSummaryRow([firstQuestionId, secondQuestionId], [1, 2]),
    ]);
    const logger = new FakeLogger();
    const repo = new DrizzlePracticeSessionRepository(
      db,
      () => new Date(),
      logger,
    );

    await expect(
      repo.findCompletedHistorySummariesByUserId(userId, 10, 0),
    ).resolves.toEqual({ rows: [], total: 1 });
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ sessionId }),
        msg: 'Skipping corrupt completed practice session row',
      }),
    ]);
  });
});
