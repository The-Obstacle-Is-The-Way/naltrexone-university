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

function createQuestionStateDb(input: {
  snapshots: Array<{ state: StateRow; endedAt: Date | null }>;
  updatedRows: StateRow[][];
  sessionStatus?: { endedAt: Date | null } | null;
}) {
  const limit = vi.fn();
  for (const snapshot of input.snapshots) {
    limit.mockResolvedValueOnce([
      {
        state: snapshot.state,
        endedAt: snapshot.endedAt,
      },
    ]);
  }

  const select = vi.fn(() => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({ limit }),
      }),
    }),
  }));

  const updateReturning = vi.fn();
  for (const rows of input.updatedRows) {
    updateReturning.mockResolvedValueOnce(rows);
  }
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    db: {
      select,
      update,
      query: {
        practiceSessions: {
          findFirst: vi.fn(async () => input.sessionStatus ?? null),
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    },
    select,
    update,
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
    const { db } = createQuestionStateDb({
      snapshots: [{ state: existing, endedAt: null }],
      updatedRows: [[{ ...existing, version: 1 }]],
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
    const { db, select, updateReturning } = createQuestionStateDb({
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

    expect(select).toHaveBeenCalledTimes(2);
    expect(updateReturning).toHaveBeenCalledTimes(2);
  });

  it('throws INTERNAL_ERROR when all version retries are exhausted', async () => {
    const snapshot = createStateRow({
      questionId: firstQuestionId,
      position: 0,
      version: 0,
    });
    const { db, select, updateReturning } = createQuestionStateDb({
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
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(updateReturning).toHaveBeenCalledTimes(3);
    expect(select).toHaveBeenCalledTimes(4);
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
