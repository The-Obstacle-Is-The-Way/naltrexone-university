// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAttempt,
  createPracticeSession,
} from '@/src/domain/test-helpers';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
} from '../test-helpers/fakes';
import { EndPracticeSessionUseCase } from './end-practice-session';

describe('EndPracticeSessionUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns computed totals and duration when ending a session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt: null,
      }),
    ]);

    const attempts = new FakeAttemptRepository([
      createAttempt({
        userId: 'user-1',
        questionId: 'q1',
        practiceSessionId: 'session-1',
        isCorrect: true,
      }),
      createAttempt({
        userId: 'user-1',
        questionId: 'q2',
        practiceSessionId: 'session-1',
        isCorrect: false,
      }),
    ]);

    const useCase = new EndPracticeSessionUseCase(sessions, attempts);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 2,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 600,
      },
    });
  });
});
