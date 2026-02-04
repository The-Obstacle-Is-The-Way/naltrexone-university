import { describe, expect, it } from 'vitest';
import { createAttempt, createQuestion } from '@/src/domain/test-helpers';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetUserStatsUseCase } from './get-user-stats';

describe('GetUserStatsUseCase', () => {
  it('computes stats from attempts and joins recent activity slugs', async () => {
    const now = new Date('2026-02-01T12:00:00Z');

    const useCase = new GetUserStatsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T11:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q2',
          isCorrect: false,
          answeredAt: new Date('2026-01-31T11:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q3',
          isCorrect: true,
          answeredAt: new Date('2026-01-20T11:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1' }),
        createQuestion({ id: 'q2', slug: 'q-2' }),
        createQuestion({ id: 'q3', slug: 'q-3' }),
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
          attemptId: 'attempt-q1',
          answeredAt: '2026-02-01T11:00:00.000Z',
          questionId: 'q1',
          slug: 'q-1',
          isCorrect: true,
        },
        {
          isAvailable: true,
          attemptId: 'attempt-q2',
          answeredAt: '2026-01-31T11:00:00.000Z',
          questionId: 'q2',
          slug: 'q-2',
          isCorrect: false,
        },
        {
          isAvailable: true,
          attemptId: 'attempt-q3',
          answeredAt: '2026-01-20T11:00:00.000Z',
          questionId: 'q3',
          slug: 'q-3',
          isCorrect: true,
        },
      ],
    });
  });

  it('logs warning and marks recent activity unavailable when question is missing', async () => {
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
});
