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
      tagFilters: ['tag-1'],
      difficultyFilters: ['easy'],
      startedAt,
      endedAt: null,
    });
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
