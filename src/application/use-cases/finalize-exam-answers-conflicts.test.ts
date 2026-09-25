import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApplicationError,
  AttemptConflictMessages,
  PracticeSessionConflictMessages,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createFinalizeQuestion,
  passthroughTransaction,
} from '@/src/application/test-helpers/finalize-exam-fixtures';
import {
  createAttempt,
  createPracticeSession,
} from '@/src/domain/test-helpers';
import {
  FinalizeExamAnswersUseCase,
  type FinalizeExamAnswersWriteTransaction,
} from './finalize-exam-answers';

class SequencedFindPracticeSessionRepository extends FakePracticeSessionRepository {
  private findCallCount = 0;

  constructor(
    private readonly firstSession: ReturnType<typeof createPracticeSession>,
    private readonly laterSession: ReturnType<
      typeof createPracticeSession
    > | null,
  ) {
    super([]);
  }

  override async findByIdAndUserId(
    sessionId: string,
    userId: string,
  ): Promise<ReturnType<typeof createPracticeSession> | null> {
    if (
      sessionId !== this.firstSession.id ||
      userId !== this.firstSession.userId
    ) {
      return null;
    }

    this.findCallCount += 1;
    return this.findCallCount === 1 ? this.firstSession : this.laterSession;
  }
}

describe('FinalizeExamAnswersUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects already-ended sessions', async () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        endedAt: new Date('2026-03-17T12:00:00.000Z'),
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Cannot finalize a completed session'),
    );
  });

  it('maps a double-finalize already-answered loser to AlreadyEnded after a fresh re-read', async () => {
    const activeSession = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'q1-correct',
          draftSavedAt: new Date('2026-03-17T12:00:00.000Z'),
          draftCumulativeMs: 20_000,
        },
      ],
    });
    const endedSession = createPracticeSession({
      ...activeSession,
      endedAt: new Date('2026-03-17T12:30:00.000Z'),
    });
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ]);
    const outerSessions = new SequencedFindPracticeSessionRepository(
      activeSession,
      endedSession,
    );
    const txSessions = new FakePracticeSessionRepository([activeSession]);
    const txAttempts = new FakeAttemptRepository([
      createAttempt({
        id: 'attempt-1',
        userId: 'user-1',
        questionId: 'q1',
        practiceSessionId: 'session-1',
        selectedChoiceId: 'q1-correct',
        isCorrect: true,
      }),
    ]);
    const writeTransaction: FinalizeExamAnswersWriteTransaction = async (fn) =>
      fn({
        questions,
        attempts: txAttempts,
        sessions: txSessions,
      });
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      new FakeAttemptRepository(),
      outerSessions,
      writeTransaction,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: PracticeSessionConflictMessages.AlreadyEnded,
      details: { reason: PracticeSessionConflictReasons.AlreadyEnded },
    });
  });

  it('keeps an already-answered finalize conflict unchanged when the fresh re-read is still active', async () => {
    const activeSession = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'q1-correct',
          draftSavedAt: new Date('2026-03-17T12:00:00.000Z'),
          draftCumulativeMs: 20_000,
        },
      ],
    });
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ]);
    const outerSessions = new SequencedFindPracticeSessionRepository(
      activeSession,
      activeSession,
    );
    const txSessions = new FakePracticeSessionRepository([activeSession]);
    const txAttempts = new FakeAttemptRepository([
      createAttempt({
        id: 'attempt-1',
        userId: 'user-1',
        questionId: 'q1',
        practiceSessionId: 'session-1',
        selectedChoiceId: 'q1-correct',
        isCorrect: true,
      }),
    ]);
    const writeTransaction: FinalizeExamAnswersWriteTransaction = async (fn) =>
      fn({
        questions,
        attempts: txAttempts,
        sessions: txSessions,
      });
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      new FakeAttemptRepository(),
      outerSessions,
      writeTransaction,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: AttemptConflictMessages.AlreadyAnsweredInSession,
      details: undefined,
    });
  });

  it('keeps an already-answered finalize conflict unchanged when the fresh re-read misses the session', async () => {
    const activeSession = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'q1-correct',
          draftSavedAt: new Date('2026-03-17T12:00:00.000Z'),
          draftCumulativeMs: 20_000,
        },
      ],
    });
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ]);
    const outerSessions = new SequencedFindPracticeSessionRepository(
      activeSession,
      null,
    );
    const txSessions = new FakePracticeSessionRepository([activeSession]);
    const txAttempts = new FakeAttemptRepository([
      createAttempt({
        id: 'attempt-1',
        userId: 'user-1',
        questionId: 'q1',
        practiceSessionId: 'session-1',
        selectedChoiceId: 'q1-correct',
        isCorrect: true,
      }),
    ]);
    const writeTransaction: FinalizeExamAnswersWriteTransaction = async (fn) =>
      fn({
        questions,
        attempts: txAttempts,
        sessions: txSessions,
      });
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      new FakeAttemptRepository(),
      outerSessions,
      writeTransaction,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: AttemptConflictMessages.AlreadyAnsweredInSession,
      details: undefined,
    });
  });

  it('rejects missing sessions', async () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'missing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('rejects tutor sessions', async () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'tutor',
        questionIds: ['q1'],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Finalize exam is only available in exam mode',
      ),
    );
  });
});
