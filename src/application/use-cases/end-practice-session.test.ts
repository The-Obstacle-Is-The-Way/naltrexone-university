import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationError } from '@/src/application/errors';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import type { QuestionAvailability } from '@/src/domain/value-objects';
import {
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { EndPracticeSessionUseCase } from './end-practice-session';
import { GetSessionHistoryUseCase } from './get-session-history';

// The bank the sessions below are drawn from: every question available
// unless a case says otherwise.
function bank(
  states: Readonly<Record<string, QuestionAvailability>> = {},
): FakeQuestionRepository {
  return new FakeQuestionRepository(
    ['q1', 'q2', 'q3'].map((id) => {
      const availability = states[id] ?? 'available';
      return createQuestion({
        id,
        status: availability === 'available' ? 'published' : 'archived',
        availability,
      });
    }),
  );
}

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

  it('rejects generic end for an active exam session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      buildSessionWithOneAnswered('session-exam', 'exam'),
    ]);

    const useCase = new EndPracticeSessionUseCase(sessions, bank());

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-exam' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Active exam sessions must be finalized or discarded, not ended',
    } satisfies Partial<ApplicationError>);
  });

  it('refuses a session that is missing or already ended', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        mode: 'tutor',
        endedAt: new Date('2026-02-01T00:10:00Z'),
      }),
      // An ended exam is refused as ended, before the active-exam rule.
      createPracticeSession({
        id: 'exam-ended',
        userId: 'user-1',
        mode: 'exam',
        endedAt: new Date('2026-02-01T00:10:00Z'),
      }),
    ]);
    const useCase = new EndPracticeSessionUseCase(sessions, bank());

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-missing' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    });
    for (const sessionId of ['session-ended', 'exam-ended']) {
      await expect(
        useCase.execute({ userId: 'user-1', sessionId }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Practice session already ended',
      });
    }
  });

  // A repository that reports a session ended without its end time breaks
  // its contract; the use case refuses to summarize it.
  it('fails loudly when the repository does not end the session', async () => {
    class NotEndingRepository extends FakePracticeSessionRepository {
      override async end(sessionId: string, userId: string) {
        return { ...(await super.end(sessionId, userId)), endedAt: null };
      }
    }
    const sessions = new NotEndingRepository([
      buildSessionWithOneAnswered('session-tutor', 'tutor'),
    ]);

    await expect(
      new EndPracticeSessionUseCase(sessions, bank()).execute({
        userId: 'user-1',
        sessionId: 'session-tutor',
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Practice session did not end',
    });
  });

  it('returns tutor accuracy using total question count denominator when calculating session metrics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00Z'));

    const sessions = new FakePracticeSessionRepository([
      buildSessionWithOneAnswered('session-tutor', 'tutor'),
    ]);

    const useCase = new EndPracticeSessionUseCase(sessions, bank());

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-tutor' }),
    ).resolves.toMatchObject({
      sessionId: 'session-tutor',
      mode: 'tutor',
      questionCount: 3,
      totals: {
        answered: 1,
        scored: 3,
        correct: 1,
        accuracy: 1 / 3,
      },
    });
  });

  it('returns tutor accuracy that matches session-history denominator semantics', async () => {
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
    const sessionsForHistory = new FakePracticeSessionRepository(
      [completedTutorSession],
      { publishedQuestionSlugsById: new Map([['q1', 'q-1']]) },
    );

    const endUseCase = new EndPracticeSessionUseCase(sessionsForEnd, bank());
    const historyUseCase = new GetSessionHistoryUseCase(sessionsForHistory);

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

  // ADR-022 Decision 3: the summary and History score the same items.
  it('agrees with session history when a question is withdrawn', async () => {
    vi.useFakeTimers();
    const endedAt = new Date('2026-02-01T00:10:00Z');
    vi.setSystemTime(endedAt);
    const answered = (questionId: string, isCorrect: boolean) => ({
      questionId,
      markedForReview: false,
      latestSelectedChoiceId: `choice-${questionId}`,
      latestIsCorrect: isCorrect,
      latestAnsweredAt: new Date('2026-02-01T00:05:00Z'),
    });
    const completed = createPracticeSession({
      id: 'session-tutor',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        answered('q1', true),
        answered('q2', true),
        answered('q3', false),
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    const endResult = await new EndPracticeSessionUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({ ...completed, endedAt: null }),
      ]),
      bank({ q2: 'withdrawn' }),
    ).execute({ userId: 'user-1', sessionId: 'session-tutor' });
    const historyResult = await new GetSessionHistoryUseCase(
      new FakePracticeSessionRepository([completed], {
        publishedQuestionSlugsById: new Map([
          ['q1', 'q-1'],
          ['q3', 'q-3'],
        ]),
        availabilityByQuestionId: new Map([['q2', 'withdrawn']]),
      }),
    ).execute({ userId: 'user-1', limit: 10, offset: 0, mode: 'tutor' });

    expect(endResult.totals).toMatchObject({
      answered: 3,
      scored: 2,
      correct: 1,
      accuracy: 0.5,
    });
    expect(historyResult.rows[0]).toMatchObject({
      answered: endResult.totals.answered,
      scored: endResult.totals.scored,
      correct: endResult.totals.correct,
      accuracy: endResult.totals.accuracy,
    });
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

    const useCase = new EndPracticeSessionUseCase(sessions, bank());

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      mode: 'tutor',
      questionCount: 2,
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 1,
        scored: 2,
        correct: 0,
        accuracy: 0,
        durationSeconds: 600,
      },
    });
  });

  it('propagates NOT_FOUND when the session does not exist', async () => {
    const sessions = new FakePracticeSessionRepository([]);
    const useCase = new EndPracticeSessionUseCase(sessions, bank());

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
    const useCase = new EndPracticeSessionUseCase(sessions, bank());

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-ended' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    } satisfies Partial<ApplicationError>);
  });
});
