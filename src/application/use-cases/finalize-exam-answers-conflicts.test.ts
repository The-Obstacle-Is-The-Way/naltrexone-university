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
    // The fresh re-read after the conflict finds the winner's ended session.
    const outerSessions = new FakePracticeSessionRepository([endedSession]);
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
      cause: expect.objectContaining({
        message: AttemptConflictMessages.AlreadyAnsweredInSession,
      }),
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
    const outerSessions = new FakePracticeSessionRepository([activeSession]);
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
    const outerSessions = new FakePracticeSessionRepository([]);
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

  // Only the conflict a second finalize meets, an attempt already answered in
  // the session, means another finalize won; any other failure stays as is.
  it.each([
    [
      'a different conflict',
      new ApplicationError('CONFLICT', 'Another conflict'),
    ],
    [
      'another code with the same message',
      new ApplicationError(
        'INTERNAL_ERROR',
        AttemptConflictMessages.AlreadyAnsweredInSession,
      ),
    ],
    [
      'a failure that is not an application error',
      new Error(AttemptConflictMessages.AlreadyAnsweredInSession),
    ],
  ])(
    'keeps %s unchanged even when the session has since ended',
    async (_name, failure) => {
      class FailingAttempts extends FakeAttemptRepository {
        override async insert(): Promise<never> {
          throw failure;
        }
      }
      const activeSession = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
      });
      const questions = new FakeQuestionRepository([
        createFinalizeQuestion('q1', 'q1-correct'),
      ]);
      const txSessions = new FakePracticeSessionRepository([activeSession]);
      const useCase = new FinalizeExamAnswersUseCase(
        questions,
        new FakeAttemptRepository(),
        new FakePracticeSessionRepository([
          createPracticeSession({
            ...activeSession,
            endedAt: new Date('2026-03-17T12:30:00.000Z'),
          }),
        ]),
        async (fn) =>
          fn({
            questions,
            attempts: new FailingAttempts(),
            sessions: txSessions,
          }),
      );

      await expect(
        useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
      ).rejects.toBe(failure);
    },
  );

  // The repository ends the session it is asked to end; one it returns still
  // open breaks that contract, and the use case refuses to summarize it.
  it('fails loudly when the repository does not end the session', async () => {
    class NotEndingSessions extends FakePracticeSessionRepository {
      override async end(id: string, userId: string, endedAt?: Date) {
        return { ...(await super.end(id, userId, endedAt)), endedAt: null };
      }
    }
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct'),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new NotEndingSessions([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
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
      useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
    ).rejects.toEqual(
      new ApplicationError('INTERNAL_ERROR', 'Practice session did not end'),
    );
  });
});
