import { describe, expect, it } from 'vitest';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createPracticeSession,
} from '@/src/domain/test-helpers';
import { GetIncompletePracticeSessionUseCase } from './get-incomplete-practice-session';

describe('GetIncompletePracticeSessionUseCase', () => {
  it('returns null when no incomplete session exists', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        endedAt: new Date('2026-02-05T12:00:00Z'),
      }),
    ]);
    const attempts = new FakeAttemptRepository([]);

    const useCase = new GetIncompletePracticeSessionUseCase(sessions, attempts);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toBeNull();
  });

  it('returns latest incomplete session with progress', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-old',
        userId: 'user-1',
        mode: 'tutor',
        questionIds: ['q1', 'q2', 'q3'],
        startedAt: new Date('2026-02-05T08:00:00Z'),
        endedAt: null,
      }),
      createPracticeSession({
        id: 'session-new',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q4', 'q5', 'q6', 'q7'],
        startedAt: new Date('2026-02-05T09:00:00Z'),
        endedAt: null,
      }),
    ]);
    const attempts = new FakeAttemptRepository([
      createAttempt({
        id: 'a1',
        userId: 'user-1',
        questionId: 'q4',
        practiceSessionId: 'session-new',
      }),
      createAttempt({
        id: 'a2',
        userId: 'user-1',
        questionId: 'q4',
        practiceSessionId: 'session-new',
      }),
      createAttempt({
        id: 'a3',
        userId: 'user-1',
        questionId: 'q5',
        practiceSessionId: 'session-new',
      }),
      createAttempt({
        id: 'a4',
        userId: 'user-1',
        questionId: 'q999',
        practiceSessionId: 'session-new',
      }),
    ]);

    const useCase = new GetIncompletePracticeSessionUseCase(sessions, attempts);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      sessionId: 'session-new',
      mode: 'exam',
      answeredCount: 2,
      totalCount: 4,
      startedAt: '2026-02-05T09:00:00.000Z',
    });
  });
});
