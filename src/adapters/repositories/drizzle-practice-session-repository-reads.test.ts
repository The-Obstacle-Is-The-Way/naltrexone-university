import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import { restoreDrizzlePracticeSessionRepositoryTestMocks } from './drizzle-practice-session-repository-test-helpers';

const sessionId = crypto.randomUUID();
const alternateSessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const firstQuestionId = crypto.randomUUID();
const secondQuestionId = crypto.randomUUID();
const thirdQuestionId = crypto.randomUUID();
const orphanQuestionId = crypto.randomUUID();

describe('DrizzlePracticeSessionRepository reads', () => {
  afterEach(restoreDrizzlePracticeSessionRepositoryTestMocks);

  it('returns null when session is not found', async () => {
    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.findByIdAndUserId(sessionId, userId)).resolves.toBeNull();
  });

  it('returns latest incomplete session for a user', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const queryFindFirst = vi.fn().mockResolvedValue({
      id: alternateSessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 3,
        tagSlugs: ['tag-1'],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId, thirdQuestionId],
      },
      startedAt,
      endedAt: null,
    });

    const db = {
      query: {
        practiceSessions: {
          findFirst: queryFindFirst,
        },
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.findLatestIncompleteByUserId(userId)).resolves.toEqual({
      id: alternateSessionId,
      userId: userId,
      mode: 'exam',
      questionIds: [firstQuestionId, secondQuestionId, thirdQuestionId],
      questionStates: [
        {
          questionId: firstQuestionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: secondQuestionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: thirdQuestionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
      tagFilters: ['tag-1'],
      difficultyFilters: ['easy'],
      startedAt,
      endedAt: null,
    });

    expect(queryFindFirst).toHaveBeenCalledTimes(1);
  });

  it('returns completed sessions with total count', async () => {
    const endedAt = new Date('2026-02-02T00:00:00.000Z');
    const startedAt = new Date('2026-02-01T23:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        id: sessionId,
        userId: userId,
        mode: 'exam',
        paramsJson: {
          count: 2,
          tagSlugs: ['tag-1'],
          difficulties: ['easy'],
          questionIds: [firstQuestionId, secondQuestionId],
        },
        startedAt,
        endedAt,
      },
    ]);
    const countWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
    const select = vi.fn(() => ({
      from: () => ({
        where: countWhere,
      }),
    }));

    const tx = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
          findMany,
        },
      },
      select,
    } as const;
    const transaction = vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.findCompletedByUserId(userId, 10, 0)).resolves.toEqual({
      rows: [
        {
          id: sessionId,
          userId: userId,
          mode: 'exam',
          questionIds: [firstQuestionId, secondQuestionId],
          questionStates: [
            {
              questionId: firstQuestionId,
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
              draftSelectedChoiceId: null,
              draftSavedAt: null,
              draftCumulativeMs: 0,
            },
            {
              questionId: secondQuestionId,
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
              draftSelectedChoiceId: null,
              draftSavedAt: null,
              draftCumulativeMs: 0,
            },
          ],
          tagFilters: ['tag-1'],
          difficultyFilters: ['easy'],
          startedAt,
          endedAt,
        },
      ],
      total: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('returns empty rows when limit is non-positive while preserving total', async () => {
    const findMany = vi.fn();
    const countWhere = vi.fn().mockResolvedValue([{ count: 3 }]);
    const select = vi.fn(() => ({
      from: () => ({
        where: countWhere,
      }),
    }));

    const tx = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
          findMany,
        },
      },
      select,
    } as const;
    const transaction = vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.findCompletedByUserId(userId, 0, 0)).resolves.toEqual({
      rows: [],
      total: 3,
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it('returns null when no incomplete session exists for user', async () => {
    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.findLatestIncompleteByUserId(userId)).resolves.toBeNull();
  });

  it('parses paramsJson and maps the row to a domain PracticeSession', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: ['tag-1'],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt,
      endedAt: null,
    } as const;

    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(repo.findByIdAndUserId(sessionId, userId)).resolves.toEqual({
      id: sessionId,
      userId: userId,
      mode: 'tutor',
      questionIds: [firstQuestionId, secondQuestionId],
      questionStates: [
        {
          questionId: firstQuestionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: secondQuestionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
      tagFilters: ['tag-1'],
      difficultyFilters: ['easy'],
      startedAt,
      endedAt: null,
    });
  });

  it('returns INTERNAL_ERROR when persisted paramsJson is invalid', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'tutor',
      paramsJson: {
        count: 0,
        tagSlugs: [],
        difficulties: [],
        questionIds: [],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.findByIdAndUserId(sessionId, userId),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('drops orphaned questionStates without calling console.warn', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestionId],
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
          {
            questionId: orphanQuestionId,
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
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
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const session = await repo.findByIdAndUserId(sessionId, userId);
    expect(session?.questionStates).toEqual([
      {
        questionId: firstQuestionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      },
    ]);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
