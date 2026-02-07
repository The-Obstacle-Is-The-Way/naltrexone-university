import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { FakePracticeSessionRepository } from '../test-helpers/fakes';
import { GetSessionHistoryUseCase } from './get-session-history';

describe('GetSessionHistoryUseCase', () => {
  it('returns empty rows when user has no completed sessions', async () => {
    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  });

  it('returns completed sessions with computed totals', async () => {
    const sessionOneStartedAt = new Date('2026-02-06T10:00:00.000Z');
    const sessionOneEndedAt = new Date('2026-02-06T10:15:00.000Z');
    const sessionTwoStartedAt = new Date('2026-02-05T10:00:00.000Z');
    const sessionTwoEndedAt = new Date('2026-02-05T10:30:00.000Z');

    const sessions = [
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1', 'q2', 'q3'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'c1',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-02-06T10:01:00.000Z'),
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: 'c2',
            latestIsCorrect: false,
            latestAnsweredAt: new Date('2026-02-06T10:02:00.000Z'),
          },
          {
            questionId: 'q3',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
        startedAt: sessionOneStartedAt,
        endedAt: sessionOneEndedAt,
      }),
      createPracticeSession({
        id: 'session-2',
        userId: 'user-1',
        mode: 'tutor',
        questionIds: ['q10', 'q11'],
        questionStates: [
          {
            questionId: 'q10',
            markedForReview: false,
            latestSelectedChoiceId: 'c10',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-02-05T10:05:00.000Z'),
          },
          {
            questionId: 'q11',
            markedForReview: false,
            latestSelectedChoiceId: 'c11',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-02-05T10:10:00.000Z'),
          },
        ],
        startedAt: sessionTwoStartedAt,
        endedAt: sessionTwoEndedAt,
      }),
      createPracticeSession({
        id: 'session-3',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q20'],
        startedAt: new Date('2026-02-07T10:00:00.000Z'),
        endedAt: null,
      }),
    ];

    const useCase = new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository(sessions),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          sessionId: 'session-1',
          mode: 'exam',
          questionCount: 3,
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 900,
          startedAt: sessionOneStartedAt.toISOString(),
          endedAt: sessionOneEndedAt.toISOString(),
        },
        {
          sessionId: 'session-2',
          mode: 'tutor',
          questionCount: 2,
          answered: 2,
          correct: 2,
          accuracy: 1,
          durationSeconds: 1800,
          startedAt: sessionTwoStartedAt.toISOString(),
          endedAt: sessionTwoEndedAt.toISOString(),
        },
      ],
      total: 2,
      limit: 10,
      offset: 0,
    });
  });

  it('skips rows with missing endedAt even if a repository implementation returns them', async () => {
    const sessionWithMissingEnd = createPracticeSession({
      id: 'session-bad',
      userId: 'user-1',
      endedAt: null,
    });

    const sessions = new FakePracticeSessionRepository([]);
    sessions.findCompletedByUserId = async () => ({
      rows: [sessionWithMissingEnd],
      total: 1,
    });

    const useCase = new GetSessionHistoryUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [],
      total: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('propagates repository failures', async () => {
    const sessions = new FakePracticeSessionRepository([]);
    sessions.findCompletedByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed query');
    };

    const useCase = new GetSessionHistoryUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
