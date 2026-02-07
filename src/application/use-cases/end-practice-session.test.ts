// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationError } from '@/src/application/errors';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { FakePracticeSessionRepository } from '../test-helpers/fakes';
import { EndPracticeSessionUseCase } from './end-practice-session';

describe('EndPracticeSessionUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns totals from persisted latest question state (not raw attempt count)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        questionIds: ['q1', 'q2'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: true,
            latestSelectedChoiceId: 'choice-2',
            latestIsCorrect: false,
            latestAnsweredAt: new Date('2026-02-01T00:05:00Z'),
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
        endedAt: null,
      }),
    ]);

    const useCase = new EndPracticeSessionUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 1,
        correct: 0,
        accuracy: 0,
        durationSeconds: 600,
      },
    });
  });

  it('propagates NOT_FOUND when the session does not exist', async () => {
    const sessions = new FakePracticeSessionRepository([]);
    const useCase = new EndPracticeSessionUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ApplicationError>);
  });

  it('propagates CONFLICT when the session is already ended', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        endedAt: new Date('2026-02-01T00:05:00Z'),
      }),
    ]);
    const useCase = new EndPracticeSessionUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-ended' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    } satisfies Partial<ApplicationError>);
  });
});
