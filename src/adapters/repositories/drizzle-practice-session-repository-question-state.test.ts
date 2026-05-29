import { afterEach, describe, expect, it, vi } from 'vitest';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import { restoreDrizzlePracticeSessionRepositoryTestMocks } from './drizzle-practice-session-repository-test-helpers';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const firstQuestionId = crypto.randomUUID();
const secondQuestionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();
const latestChoiceId = crypto.randomUUID();
const draftChoiceId = crypto.randomUUID();
const newerChoiceId = crypto.randomUUID();
const olderChoiceId = crypto.randomUUID();

describe('DrizzlePracticeSessionRepository question state', () => {
  afterEach(restoreDrizzlePracticeSessionRepositoryTestMocks);

  it('records the latest answer state for a session question', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        selectedChoiceId: selectedChoiceId,
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toEqual({
      questionId: firstQuestionId,
      markedForReview: false,
      latestSelectedChoiceId: selectedChoiceId,
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
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: selectedChoiceId,
            latestIsCorrect: true,
            latestAnsweredAt: answeredAt.toISOString(),
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
      }),
    });
  });

  it('saves a draft answer snapshot for a session question', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: latestChoiceId,
            latestIsCorrect: true,
            latestAnsweredAt: '2026-02-01T00:05:00.000Z',
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
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        selectedChoiceId: draftChoiceId,
        cumulativeMs: 45_000,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      latestSelectedChoiceId: latestChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: new Date('2026-02-01T00:05:00.000Z'),
      draftSelectedChoiceId: draftChoiceId,
      draftSavedAt: expect.any(Date),
      draftCumulativeMs: 45_000,
    });

    expect(updateSet).toHaveBeenCalledWith({
      paramsJson: expect.objectContaining({
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: latestChoiceId,
            latestIsCorrect: true,
            latestAnsweredAt: '2026-02-01T00:05:00.000Z',
            draftSelectedChoiceId: draftChoiceId,
            draftSavedAt: expect.any(String),
            draftCumulativeMs: 45_000,
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
      }),
    });
  });

  it('finalizes a draft answer into latest fields and clears the draft snapshot', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: draftChoiceId,
            draftSavedAt: '2026-02-01T00:05:00.000Z',
            draftCumulativeMs: 45_000,
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
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        outcome: answeredOutcome(draftChoiceId),
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toEqual({
      questionId: firstQuestionId,
      markedForReview: false,
      latestSelectedChoiceId: draftChoiceId,
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
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: draftChoiceId,
            latestIsCorrect: true,
            latestAnsweredAt: answeredAt.toISOString(),
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
      }),
    });
  });

  it('finalizes an omitted answer state for session review', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId],
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: true,
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

    const updateReturning = vi.fn(async () => [{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        outcome: omittedOutcome(),
        isCorrect: false,
        answeredAt,
      }),
    ).resolves.toEqual({
      questionId: firstQuestionId,
      markedForReview: true,
      latestSelectedChoiceId: null,
      latestIsCorrect: false,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });

    expect(updateSet).toHaveBeenCalledWith({
      paramsJson: expect.objectContaining({
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: false,
            latestAnsweredAt: answeredAt.toISOString(),
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
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId],
        questionStates: [
          {
            questionId: firstQuestionId,
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: newerChoiceId,
            draftSavedAt: '2026-02-01T00:05:00.000Z',
            draftCumulativeMs: 45_000,
          },
        ],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        selectedChoiceId: olderChoiceId,
        cumulativeMs: 30_000,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      draftSelectedChoiceId: newerChoiceId,
      draftSavedAt: new Date('2026-02-01T00:05:00.000Z'),
      draftCumulativeMs: 45_000,
    });
  });

  it('retries question-state update when a concurrent write causes a stale write miss', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const findFirst = vi.fn(async () => row);
    const updateReturning = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        selectedChoiceId: selectedChoiceId,
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(updateReturning).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('throws INTERNAL_ERROR when all CAS retries are exhausted', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
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
        sessionId: sessionId,
        userId: userId,
        questionId: firstQuestionId,
        selectedChoiceId: selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(update).toHaveBeenCalledTimes(3);
    expect(findFirst).toHaveBeenCalledTimes(4);
  });

  it('updates mark-for-review state for a session question', async () => {
    const row = {
      id: sessionId,
      userId: userId,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: ['easy'],
        questionIds: [firstQuestionId, secondQuestionId],
      },
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: null,
    } as const;

    const updateReturning = vi.fn(async () => [{ id: sessionId }]);
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
        sessionId: sessionId,
        userId: userId,
        questionId: secondQuestionId,
        markedForReview: true,
      }),
    ).resolves.toEqual({
      questionId: secondQuestionId,
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
