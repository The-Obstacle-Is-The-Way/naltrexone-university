import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationError } from '@/src/application/errors';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { EndPracticeSessionUseCase } from './end-practice-session';
import { GetSessionHistoryUseCase } from './get-session-history';

describe('EndPracticeSessionUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function buildSessionWithOneAnswered(
    id: string,
    mode: 'exam' | 'tutor',
  ): ReturnType<typeof createPracticeSession> {
    return createPracticeSession({
      id,
      userId: 'user-1',
      mode,
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:05:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q3',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt: null,
    });
  }

  it('computes exam accuracy using total question count denominator', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      buildSessionWithOneAnswered('session-exam', 'exam'),
    ]);

    const useCase = new EndPracticeSessionUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-exam' }),
    ).resolves.toMatchObject({
      sessionId: 'session-exam',
      mode: 'exam',
      questionCount: 3,
      totals: {
        answered: 1,
        correct: 1,
        accuracy: 1 / 3,
      },
    });
  });

  it('computes tutor accuracy using total question count denominator', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      buildSessionWithOneAnswered('session-tutor', 'tutor'),
    ]);

    const useCase = new EndPracticeSessionUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-tutor' }),
    ).resolves.toMatchObject({
      sessionId: 'session-tutor',
      mode: 'tutor',
      questionCount: 3,
      totals: {
        answered: 1,
        correct: 1,
        accuracy: 1 / 3,
      },
    });
  });

  it('matches tutor accuracy with session-history denominator semantics', async () => {
    vi.useFakeTimers();
    const endedAt = new Date('2026-02-01T00:10:00Z');
    vi.setSystemTime(endedAt);
    const startedAt = new Date('2026-02-01T00:00:00Z');

    const completedTutorSession = createPracticeSession({
      id: 'session-tutor',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:05:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q3',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
      startedAt,
      endedAt,
    });

    const sessionsForEnd = new FakePracticeSessionRepository([
      createPracticeSession({
        ...completedTutorSession,
        endedAt: null,
      }),
    ]);
    const sessionsForHistory = new FakePracticeSessionRepository([
      completedTutorSession,
    ]);
    const questions = new FakeQuestionRepository([
      createQuestion({ id: 'q1', slug: 'q-1' }),
      createQuestion({ id: 'q2', slug: 'q-2' }),
      createQuestion({ id: 'q3', slug: 'q-3' }),
    ]);

    const endUseCase = new EndPracticeSessionUseCase(sessionsForEnd);
    const historyUseCase = new GetSessionHistoryUseCase(
      sessionsForHistory,
      questions,
    );

    const endResult = await endUseCase.execute({
      userId: 'user-1',
      sessionId: 'session-tutor',
    });
    const historyResult = await historyUseCase.execute({
      userId: 'user-1',
      limit: 10,
      offset: 0,
      mode: 'tutor',
    });

    expect(historyResult.rows).toHaveLength(1);
    expect(endResult.totals.accuracy).toBe(historyResult.rows[0]?.accuracy);
  });

  it('returns totals from persisted latest question state (not raw attempt count)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'tutor',
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
      mode: 'tutor',
      questionCount: 2,
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
