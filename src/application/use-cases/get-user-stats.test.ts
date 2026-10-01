import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createAttempt, createQuestion } from '@/src/domain/test-helpers';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetUserStatsUseCase } from './get-user-stats';

describe('GetUserStatsUseCase', () => {
  it('shows each recent attempt as the revision it graded, even of one question (ADR-021)', async () => {
    const current = createQuestion({ id: 'q1', stemMd: 'Current stem' });
    const older = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Older stem',
    });
    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          questionRevisionId: older.revisionId,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          questionRevisionId: current.revisionId,
          answeredAt: new Date('2026-02-01T11:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([current, older]),
      new FakeLogger(),
      () => new Date('2026-02-01T12:00:00Z'),
    );

    const stats = await useCase.execute({ userId: 'user-1' });

    expect(
      stats.recentActivity.map((row) => (row.isAvailable ? row.stemMd : null)),
    ).toEqual(['Current stem', 'Older stem']);
  });

  it('returns computed stats and recent activity when user has attempts', async () => {
    const now = new Date('2026-02-01T12:00:00Z');
    const q1Attempt = createAttempt({
      userId: 'user-1',
      questionId: 'q1',
      isCorrect: true,
      answeredAt: new Date('2026-02-01T11:00:00Z'),
    });
    const q2Attempt = createAttempt({
      userId: 'user-1',
      questionId: 'q2',
      isCorrect: false,
      answeredAt: new Date('2026-01-31T11:00:00Z'),
    });
    const q3Attempt = createAttempt({
      userId: 'user-1',
      questionId: 'q3',
      isCorrect: true,
      answeredAt: new Date('2026-01-20T11:00:00Z'),
    });

    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([q1Attempt, q2Attempt, q3Attempt]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
        createQuestion({
          id: 'q2',
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'medium',
        }),
        createQuestion({
          id: 'q3',
          slug: 'q-3',
          stemMd: 'Stem for q3',
          difficulty: 'hard',
        }),
      ]),
      new FakeLogger(),
      () => now,
    );

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      totalAnswered: 3,
      accuracyOverall: 2 / 3,
      answeredLast7Days: 2,
      accuracyLast7Days: 1 / 2,
      currentStreakDays: 2,
      recentActivity: [
        {
          isAvailable: true,
          withdrawn: false,
          attemptId: q1Attempt.id,
          answeredAt: '2026-02-01T11:00:00.000Z',
          questionId: 'q1',
          sessionId: null,
          sessionMode: null,
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
          isCorrect: true,
        },
        {
          isAvailable: true,
          withdrawn: false,
          attemptId: q2Attempt.id,
          answeredAt: '2026-01-31T11:00:00.000Z',
          questionId: 'q2',
          sessionId: null,
          sessionMode: null,
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'medium',
          isCorrect: false,
        },
        {
          isAvailable: true,
          withdrawn: false,
          attemptId: q3Attempt.id,
          answeredAt: '2026-01-20T11:00:00.000Z',
          questionId: 'q3',
          sessionId: null,
          sessionMode: null,
          slug: 'q-3',
          stemMd: 'Stem for q3',
          difficulty: 'hard',
          isCorrect: true,
        },
      ],
    });
  });

  // ADR-021 §3: the learner attempted it, so it stays listed and reviewable.
  it('shows recent activity on a question withdrawn since as available, marked withdrawn', async () => {
    const now = new Date('2026-02-01T12:00:00Z');
    const withdrawn = createQuestion({
      id: 'q1',
      status: 'archived',
      stemMd: 'Answered stem',
    });
    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          answeredAt: new Date('2026-02-01T11:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([withdrawn]),
      new FakeLogger(),
      () => now,
    );

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toMatchObject({
      recentActivity: [
        {
          isAvailable: true,
          questionId: 'q1',
          stemMd: 'Answered stem',
          withdrawn: true,
        },
      ],
    });
  });

  it('returns recent activity marked unavailable and logs a warning when a referenced question is missing', async () => {
    const orphanedQuestionId = 'q-orphaned';
    const now = new Date('2026-02-01T12:00:00Z');
    const logger = new FakeLogger();

    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: orphanedQuestionId,
          isCorrect: true,
          answeredAt: new Date('2026-02-01T11:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([]),
      logger,
      () => now,
    );

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toMatchObject({
      recentActivity: [
        {
          isAvailable: false,
          questionId: orphanedQuestionId,
          sessionId: null,
          sessionMode: null,
        },
      ],
    });

    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Recent activity references missing question',
      },
    ]);
  });

  it('includes session context on recent activity rows when available', async () => {
    const now = new Date('2026-02-01T12:00:00Z');

    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          practiceSessionId: 'session-1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T11:00:00Z'),
          sessionMode: 'exam',
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
      ]),
      new FakeLogger(),
      () => now,
    );

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toMatchObject({
      recentActivity: [
        {
          isAvailable: true,
          withdrawn: false,
          questionId: 'q1',
          sessionId: 'session-1',
          sessionMode: 'exam',
        },
      ],
    });
  });

  it('propagates repository failures when stats queries fail', async () => {
    const attempts = new FakeAttemptRepository([]);
    attempts.countByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'Stats unavailable');
    };

    const useCase = new GetUserStatsUseCase(
      attempts,
      new FakeQuestionRepository([]),
      new FakeLogger(),
      () => new Date('2026-02-01T12:00:00Z'),
    );

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('defaults to the real clock', async () => {
    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          answeredAt: new Date('2000-01-01T00:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          answeredAt: new Date(),
        }),
      ]),
      new FakeQuestionRepository([createQuestion({ id: 'q1' })]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toMatchObject({
      totalAnswered: 2,
      answeredLast7Days: 1,
    });
  });
});
