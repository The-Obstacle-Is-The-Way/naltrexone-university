import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import type { ApplicationError } from '../errors';
import { FakePracticeSessionRepository } from '../test-helpers/fakes';
import { GetPracticeSessionSummaryUseCase } from './get-practice-session-summary';

describe('GetPracticeSessionSummaryUseCase', () => {
  it('returns the ended session summary when the session exists and is completed', async () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1', 'q2'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'choice-1',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt,
      }),
    ]);
    const useCase = new GetPracticeSessionSummaryUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-ended' }),
    ).resolves.toEqual({
      sessionId: 'session-ended',
      mode: 'exam',
      questionCount: 2,
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 1,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 600,
      },
    });
  });

  it('throws NOT_FOUND when the session does not exist', async () => {
    const useCase = new GetPracticeSessionSummaryUseCase(
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ApplicationError>);
  });

  it('throws CONFLICT when the session is still active', async () => {
    const useCase = new GetPracticeSessionSummaryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-active',
          userId: 'user-1',
          endedAt: null,
        }),
      ]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-active' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session has not ended',
    } satisfies Partial<ApplicationError>);
  });
});
