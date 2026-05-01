import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import { restoreDrizzlePracticeSessionRepositoryTestMocks } from './drizzle-practice-session-repository-test-helpers';

describe('DrizzlePracticeSessionRepository question state', () => {
  afterEach(restoreDrizzlePracticeSessionRepositoryTestMocks);

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
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
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
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
      }),
    });
  });

  it('saves a draft answer snapshot for a session question', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'latest-choice',
            latestIsCorrect: true,
            latestAnsweredAt: '2026-02-01T00:05:00.000Z',
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
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
      repo.saveDraftAnswer({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q1',
        selectedChoiceId: 'draft-choice',
        cumulativeMs: 45_000,
      }),
    ).resolves.toMatchObject({
      questionId: 'q1',
      latestSelectedChoiceId: 'latest-choice',
      latestIsCorrect: true,
      latestAnsweredAt: new Date('2026-02-01T00:05:00.000Z'),
      draftSelectedChoiceId: 'draft-choice',
      draftSavedAt: expect.any(Date),
      draftCumulativeMs: 45_000,
    });

    expect(updateSet).toHaveBeenCalledWith({
      paramsJson: expect.objectContaining({
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'latest-choice',
            latestIsCorrect: true,
            latestAnsweredAt: '2026-02-01T00:05:00.000Z',
            draftSelectedChoiceId: 'draft-choice',
            draftSavedAt: expect.any(String),
            draftCumulativeMs: 45_000,
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
      }),
    });
  });

  it('finalizes a draft answer into latest fields and clears the draft snapshot', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1', 'q2'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'draft-choice',
            draftSavedAt: '2026-02-01T00:05:00.000Z',
            draftCumulativeMs: 45_000,
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
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
      repo.finalizeDraftAnswer({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q1',
        selectedChoiceId: 'draft-choice',
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toEqual({
      questionId: 'q1',
      markedForReview: false,
      latestSelectedChoiceId: 'draft-choice',
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });

    expect(updateSet).toHaveBeenCalledWith({
      paramsJson: expect.objectContaining({
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'draft-choice',
            latestIsCorrect: true,
            latestAnsweredAt: answeredAt.toISOString(),
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
      }),
    });
  });

  it('ignores stale draft saves when the stored draft snapshot is newer', async () => {
    const row = {
      id: 'session_1',
      userId: 'user_1',
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'newer-choice',
            draftSavedAt: '2026-02-01T00:05:00.000Z',
            draftCumulativeMs: 45_000,
          },
        ],
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
    const repo = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
      () => new Date('2026-02-01T00:04:00.000Z'),
    );

    await expect(
      repo.saveDraftAnswer({
        sessionId: 'session_1',
        userId: 'user_1',
        questionId: 'q1',
        selectedChoiceId: 'older-choice',
        cumulativeMs: 30_000,
      }),
    ).resolves.toMatchObject({
      questionId: 'q1',
      draftSelectedChoiceId: 'newer-choice',
      draftSavedAt: new Date('2026-02-01T00:05:00.000Z'),
      draftCumulativeMs: 45_000,
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
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
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
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q2',
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
      }),
    });
  });
});
