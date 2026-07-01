import { afterEach, describe, expect, it, vi } from 'vitest';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import {
  collectColumnNames,
  collectPrimitiveValues,
  restoreDrizzlePracticeSessionRepositoryTestMocks,
} from './drizzle-practice-session-repository-test-helpers';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const firstQuestionId = crypto.randomUUID();
const secondQuestionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();
const latestChoiceId = crypto.randomUUID();
const draftChoiceId = crypto.randomUUID();
const newerChoiceId = crypto.randomUUID();
const olderChoiceId = crypto.randomUUID();

type StateRow = {
  id: string;
  practiceSessionId: string;
  questionId: string;
  position: number;
  markedForReview: boolean;
  latestSelectedChoiceId: string | null;
  latestIsCorrect: boolean | null;
  latestAnsweredAt: Date | null;
  draftSelectedChoiceId: string | null;
  draftSavedAt: Date | null;
  draftCumulativeMs: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function createStateRow(
  input: {
    questionId: string;
    position: number;
  } & Partial<StateRow>,
): StateRow {
  const now = new Date('2026-02-01T00:00:00.000Z');
  return {
    id: input.id ?? crypto.randomUUID(),
    practiceSessionId: input.practiceSessionId ?? sessionId,
    questionId: input.questionId,
    position: input.position,
    markedForReview: input.markedForReview ?? false,
    latestSelectedChoiceId: input.latestSelectedChoiceId ?? null,
    latestIsCorrect: input.latestIsCorrect ?? null,
    latestAnsweredAt: input.latestAnsweredAt ?? null,
    draftSelectedChoiceId: input.draftSelectedChoiceId ?? null,
    draftSavedAt: input.draftSavedAt ?? null,
    draftCumulativeMs: input.draftCumulativeMs ?? 0,
    version: input.version ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function expectSqlIncrementExpression(value: unknown) {
  const stringFragments = collectPrimitiveValues(value).filter(
    (primitive): primitive is string => typeof primitive === 'string',
  );

  expect([...new Set(collectColumnNames(value))]).toEqual(
    expect.arrayContaining(['version']),
  );
  expect(stringFragments.join(' ')).toContain('+ 1');
}

function expectVersionedStateUpdatePredicate(
  predicate: unknown,
  expected: { stateId: string; version: number },
) {
  expect([...new Set(collectColumnNames(predicate))]).toEqual(
    expect.arrayContaining([
      'id',
      'version',
      'practice_session_id',
      'user_id',
      'ended_at',
    ]),
  );
  expect(collectPrimitiveValues(predicate)).toEqual(
    expect.arrayContaining([expected.stateId, expected.version, userId]),
  );
}

function createQuestionStateDb(input: {
  snapshots: Array<{ state: StateRow; endedAt: Date | null }>;
  updatedRows: StateRow[][];
  sessionStatus?: {
    endedAt: Date | null;
    paramsJson?: {
      count: number;
      tagSlugs: string[];
      difficulties: string[];
      questionIds: string[];
    };
  } | null;
}) {
  const defaultParamsJson = {
    count: 1,
    tagSlugs: [],
    difficulties: [],
    questionIds: [],
  };
  const lockedSession = (endedAt: Date | null) => [
    {
      endedAt,
      paramsJson: input.sessionStatus?.paramsJson ?? defaultParamsJson,
    },
  ];
  let sessionLockIndex = 0;
  const sessionLockFor = vi.fn(async (strength: unknown) => {
    expect(strength).toBe('update');
    const snapshot = input.snapshots[sessionLockIndex];
    sessionLockIndex += 1;

    if (snapshot) return lockedSession(snapshot.endedAt);
    return input.sessionStatus
      ? lockedSession(input.sessionStatus.endedAt)
      : [];
  });

  let stateReadIndex = 0;
  const stateLimit = vi.fn(async () => {
    const snapshot = input.snapshots[stateReadIndex];
    stateReadIndex += 1;
    return snapshot ? [snapshot.state] : [];
  });

  let selectCallIndex = 0;
  const select = vi.fn(() => {
    selectCallIndex += 1;
    return selectCallIndex % 2 === 1
      ? {
          from: () => ({
            where: () => ({
              for: sessionLockFor,
            }),
          }),
        }
      : {
          from: () => ({
            where: () => ({
              limit: stateLimit,
            }),
          }),
        };
  });

  let updateAttemptIndex = 0;
  const updateReturning = vi.fn(async () => {
    const attemptIndex = updateAttemptIndex - 1;
    const snapshot = input.snapshots[attemptIndex]?.state;
    const rows = input.updatedRows[attemptIndex] ?? [];

    if (rows.length > 0 && snapshot === undefined) {
      throw new Error('Missing expected state snapshot for update attempt');
    }
    for (const row of rows) {
      expect(row.id).toBe(snapshot?.id);
      expect(row.version).toBe((snapshot?.version ?? 0) + 1);
    }

    return rows;
  });
  const updateWhere = vi.fn((predicate: unknown) => {
    const snapshot = input.snapshots[updateAttemptIndex]?.state;
    if (snapshot === undefined) {
      throw new Error('Missing expected state snapshot for update attempt');
    }
    expectVersionedStateUpdatePredicate(predicate, {
      stateId: snapshot.id,
      version: snapshot.version,
    });
    updateAttemptIndex += 1;
    return { returning: updateReturning };
  });
  const updateSet = vi.fn((values: Record<string, unknown>) => {
    expect(values).toEqual(
      expect.objectContaining({
        version: expect.anything(),
        updatedAt: expect.any(Date),
      }),
    );
    expectSqlIncrementExpression(values.version);
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set: updateSet }));
  const tx = {
    select,
    update,
  };
  const transaction = vi.fn(
    async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  );

  return {
    db: {
      transaction,
      select,
      update,
    },
    select,
    updateSet,
    updateReturning,
  } as const;
}

describe('DrizzlePracticeSessionRepository question state', () => {
  afterEach(restoreDrizzlePracticeSessionRepositoryTestMocks);

  it('records the latest answer state with a row-version update', async () => {
    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    const existing = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      version: 2,
    });
    const updated = {
      ...existing,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      version: 3,
    };
    const { db, updateSet, updateReturning } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [[updated]],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        latestSelectedChoiceId: selectedChoiceId,
        latestIsCorrect: true,
        latestAnsweredAt: answeredAt,
      }),
    );
    expect(updateReturning).toHaveBeenCalledTimes(1);
  });

  it('saves a draft answer snapshot for a session question', async () => {
    const savedAt = new Date('2026-02-01T00:06:00.000Z');
    const existing = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      latestSelectedChoiceId: latestChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: new Date('2026-02-01T00:05:00.000Z'),
    });
    const updated = {
      ...existing,
      draftSelectedChoiceId: draftChoiceId,
      draftSavedAt: savedAt,
      draftCumulativeMs: 45_000,
      version: 1,
    };
    const { db } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [[updated]],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
      () => savedAt,
    );

    await expect(
      repo.saveDraftAnswer({
        sessionId,
        userId,
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
      draftSavedAt: savedAt,
      draftCumulativeMs: 45_000,
    });
  });

  it('finalizes a draft answer into latest fields and clears the draft snapshot', async () => {
    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    const existing = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      draftSelectedChoiceId: draftChoiceId,
      draftSavedAt: new Date('2026-02-01T00:05:00.000Z'),
      draftCumulativeMs: 45_000,
    });
    const updated = {
      ...existing,
      latestSelectedChoiceId: draftChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
      version: 1,
    };
    const { db } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [[updated]],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.finalizeDraftAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        outcome: answeredOutcome(draftChoiceId),
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      latestSelectedChoiceId: draftChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });
  });

  it('finalizes an omitted answer state for session review', async () => {
    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    const existing = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      markedForReview: true,
    });
    const updated = {
      ...existing,
      latestSelectedChoiceId: null,
      latestIsCorrect: false,
      latestAnsweredAt: answeredAt,
      version: 1,
    };
    const { db } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [[updated]],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.finalizeDraftAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        outcome: omittedOutcome(),
        isCorrect: false,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      markedForReview: true,
      latestSelectedChoiceId: null,
      latestIsCorrect: false,
      latestAnsweredAt: answeredAt,
    });
  });

  it('ignores stale draft saves when the stored draft snapshot is newer', async () => {
    const existing = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      draftSelectedChoiceId: newerChoiceId,
      draftSavedAt: new Date('2026-02-01T00:05:00.000Z'),
      draftCumulativeMs: 45_000,
    });
    const { db, updateReturning } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(
      db as unknown as RepoDb,
      () => new Date('2026-02-01T00:04:00.000Z'),
    );

    await expect(
      repo.saveDraftAnswer({
        sessionId,
        userId,
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
    expect(updateReturning).not.toHaveBeenCalled();
  });

  it('retries question-state update when a concurrent write causes a stale version miss', async () => {
    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    const firstSnapshot = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      version: 0,
    });
    const retrySnapshot = { ...firstSnapshot, version: 1 };
    const updated = {
      ...retrySnapshot,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      version: 2,
    };
    const { db, updateReturning } = createQuestionStateDb({
      snapshots: [
        { state: firstSnapshot, endedAt: null },
        { state: retrySnapshot, endedAt: null },
      ],
      updatedRows: [[], [updated]],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId: firstQuestionId,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
    });

    expect(updateReturning).toHaveBeenCalledTimes(2);
  });

  it('throws CONFLICT when all version retries are exhausted', async () => {
    const snapshot = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      version: 0,
    });
    const { db, updateReturning } = createQuestionStateDb({
      snapshots: [
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
      ],
      updatedRows: [[], [], []],
      sessionStatus: { endedAt: null },
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session state changed concurrently; please retry.',
    });

    expect(updateReturning).toHaveBeenCalledTimes(3);
  });

  it('throws NOT_FOUND when the session does not exist', async () => {
    const { db } = createQuestionStateDb({
      snapshots: [],
      updatedRows: [],
      sessionStatus: null,
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
  });

  it('throws NOT_FOUND when the question is not part of an active session', async () => {
    const { db } = createQuestionStateDb({
      snapshots: [],
      updatedRows: [],
      sessionStatus: {
        endedAt: null,
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [secondQuestionId],
        },
      },
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Question is not part of this practice session',
    });
  });

  it('throws CONFLICT when a missing state belongs to an ended session', async () => {
    const { db } = createQuestionStateDb({
      snapshots: [],
      updatedRows: [],
      sessionStatus: { endedAt: new Date('2026-02-01T00:10:00.000Z') },
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
  });

  it('throws CONFLICT when the loaded session has already ended', async () => {
    const existing = createStateRow({
      questionId: firstQuestionId,
      position: 0,
    });
    const { db } = createQuestionStateDb({
      snapshots: [
        { state: existing, endedAt: new Date('2026-02-01T00:10:00.000Z') },
      ],
      updatedRows: [],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });
  });

  it('throws NOT_FOUND when the session disappears after version retries', async () => {
    const snapshot = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      version: 0,
    });
    const { db, updateReturning } = createQuestionStateDb({
      snapshots: [
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
      ],
      updatedRows: [[], [], []],
      sessionStatus: null,
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });

    expect(updateReturning).toHaveBeenCalledTimes(3);
  });

  it('throws CONFLICT when the session ends after version retries', async () => {
    const snapshot = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      version: 0,
    });
    const { db, updateReturning } = createQuestionStateDb({
      snapshots: [
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
        { state: snapshot, endedAt: null },
      ],
      updatedRows: [[], [], []],
      sessionStatus: { endedAt: new Date('2026-02-01T00:10:00.000Z') },
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: firstQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });

    expect(updateReturning).toHaveBeenCalledTimes(3);
  });

  it('updates mark-for-review state for a session question', async () => {
    const existing = createStateRow({
      questionId: secondQuestionId,
      position: 1,
    });
    const updated = {
      ...existing,
      markedForReview: true,
      version: 1,
    };
    const { db } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [[updated]],
    });

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.setQuestionMarkedForReview({
        sessionId,
        userId,
        questionId: secondQuestionId,
        markedForReview: true,
      }),
    ).resolves.toMatchObject({
      questionId: secondQuestionId,
      markedForReview: true,
    });
  });
});
