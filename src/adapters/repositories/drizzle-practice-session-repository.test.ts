import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

describe('DrizzlePracticeSessionRepository', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

    await expect(
      repo.findByIdAndUserId('session_1', 'user_1'),
    ).resolves.toBeNull();
  });

  it('returns latest incomplete session for a user', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const queryFindFirst = vi.fn().mockResolvedValue({
      id: 'session_2',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 3,
        tagSlugs: ['tag-1'],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2', 'q3'],
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

    await expect(repo.findLatestIncompleteByUserId('user_1')).resolves.toEqual({
      id: 'session_2',
      userId: 'user_1',
      mode: 'exam',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q3',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
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
        id: 'session_1',
        userId: 'user_1',
        mode: 'exam',
        paramsJson: {
          count: 2,
          tagSlugs: ['tag-1'],
          difficulties: ['easy'],
          questionIds: ['q1', 'q2'],
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

    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
          findMany,
        },
      },
      select,
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

    await expect(repo.findCompletedByUserId('user_1', 10, 0)).resolves.toEqual({
      rows: [
        {
          id: 'session_1',
          userId: 'user_1',
          mode: 'exam',
          questionIds: ['q1', 'q2'],
          questionStates: [
            {
              questionId: 'q1',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
            },
            {
              questionId: 'q2',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
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
  });

  it('returns empty rows when limit is non-positive while preserving total', async () => {
    const findMany = vi.fn();
    const countWhere = vi.fn().mockResolvedValue([{ count: 3 }]);
    const select = vi.fn(() => ({
      from: () => ({
        where: countWhere,
      }),
    }));

    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => null,
          findMany,
        },
      },
      select,
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

    await expect(repo.findCompletedByUserId('user_1', 0, 0)).resolves.toEqual({
      rows: [],
      total: 3,
    });
    expect(findMany).not.toHaveBeenCalled();
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

    await expect(
      repo.findLatestIncompleteByUserId('user_1'),
    ).resolves.toBeNull();
  });

  it('parses paramsJson and maps the row to a domain PracticeSession', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: ['tag-1'],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
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

    await expect(
      repo.findByIdAndUserId('session_1', 'user_1'),
    ).resolves.toEqual({
      id: 'session_1',
      userId: 'user_1',
      mode: 'tutor',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
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
      id: 'session_1',
      userId: 'user_1',
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
      repo.findByIdAndUserId('session_1', 'user_1'),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('drops orphaned questionStates without calling console.warn', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
          {
            questionId: 'q-orphan',
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

    const session = await repo.findByIdAndUserId('session_1', 'user_1');
    expect(session?.questionStates).toEqual([
      {
        questionId: 'q1',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      },
    ]);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('creates a practice session and returns a mapped PracticeSession', async () => {
    const startedAt = new Date('2026-02-01T00:00:00.000Z');
    const returningRow = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {},
      startedAt,
      endedAt: null,
    };

    const insertValues = vi.fn(() => ({
      returning: async () => [returningRow],
    }));

    const db = {
      insert: () => ({
        values: insertValues,
      }),
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const paramsJson = {
      count: 2,
      tagSlugs: [],
      difficulties: ['easy', 'hard'],
      questionIds: ['q1', 'q2'],
    };

    await expect(
      repo.create({ userId: 'user_1', mode: 'exam', paramsJson }),
    ).resolves.toMatchObject({
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      tagFilters: [],
      difficultyFilters: ['easy', 'hard'],
      startedAt,
      endedAt: null,
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_1', mode: 'exam' }),
    );
  });

  it('returns VALIDATION_ERROR when create() is called with invalid paramsJson', async () => {
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

    await expect(
      repo.create({
        userId: 'user_1',
        mode: 'tutor',
        paramsJson: {
          count: 0,
          tagSlugs: [],
          difficulties: [],
          questionIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws INTERNAL_ERROR when create() does not return an inserted row', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => [],
        }),
      }),
      query: {
        practiceSessions: {
          findFirst: async () => null,
        },
      },
      update: () => {
        throw new Error('unexpected update');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const paramsJson = {
      count: 2,
      tagSlugs: [],
      difficulties: ['easy'],
      questionIds: ['q1', 'q2'],
    };

    await expect(
      repo.create({ userId: 'user_1', mode: 'tutor', paramsJson }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('records the latest answer state for a session question', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: 'session_1' }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const db = {
      query: {
        practiceSessions: {
          findFirst: vi.fn(async () => row),
        },
      },
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    await expect(
      repo.recordQuestionAnswer({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toEqual({
      questionId: 'q1',
      markedForReview: false,
      latestSelectedChoiceId: 'choice_1',
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
    });

    expect(updateSet).toHaveBeenCalledWith({
      paramsJson: expect.objectContaining({
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'choice_1',
            latestIsCorrect: true,
            latestAnsweredAt: answeredAt.toISOString(),
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
      }),
    });
  });

  it('retries question-state update when a concurrent write causes a stale write miss', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const findFirst = vi.fn(async () => row);
    const updateReturning = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'session_1' }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const db = {
      query: {
        practiceSessions: {
          findFirst,
        },
      },
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    await expect(
      repo.recordQuestionAnswer({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId: 'q1',
      latestSelectedChoiceId: 'choice_1',
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(updateReturning).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('throws INTERNAL_ERROR when all CAS retries are exhausted', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const findFirst = vi.fn(async () => row);
    const updateReturning = vi.fn().mockResolvedValue([]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const db = {
      query: {
        practiceSessions: {
          findFirst,
        },
      },
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q1',
        selectedChoiceId: 'choice_1',
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(update).toHaveBeenCalledTimes(3);
    expect(findFirst).toHaveBeenCalledTimes(4);
  });

  it('updates mark-for-review state for a session question', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: 'session_1' }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const db = {
      query: {
        practiceSessions: {
          findFirst: vi.fn(async () => row),
        },
      },
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.setQuestionMarkedForReview({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q2',
        markedForReview: true,
      }),
    ).resolves.toEqual({
      questionId: 'q2',
      markedForReview: true,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
    });

    expect(updateSet).toHaveBeenCalledWith({
      paramsJson: expect.objectContaining({
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
          {
            questionId: 'q2',
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
      }),
    });
  });

  it('ends an active practice session', async () => {
    const now = new Date('2026-02-01T01:02:03.000Z');
    const nowFn = vi.fn(() => now);

    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: ['q1', 'q2'],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: 'session_1' }]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    const db = {
      query: {
        practiceSessions: {
          findFirst: async () => row,
        },
      },
      update,
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
      nowFn,
    );

    await expect(repo.end('session_1', 'user_1')).resolves.toMatchObject({
      id: 'session_1',
      endedAt: now,
    });
    expect(nowFn).toHaveBeenCalledTimes(1);
  });

  it('throws CONFLICT when the practice session is already ended', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'tutor',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: ['q1', 'q2'],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: new Date('2026-02-01T00:01:00.000Z'),
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

    await expect(repo.end('session_1', 'user_1')).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(repo.end('session_1', 'user_1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
