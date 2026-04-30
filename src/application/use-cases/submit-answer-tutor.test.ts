import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  createChoice,
  createPracticeSession,
  createQuestion,
  FailingRecordSessionRepository,
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  passthroughTransaction,
  SubmitAnswerUseCase,
} from './submit-answer-test-helpers';

describe('SubmitAnswerUseCase', () => {
  it('updates the persisted tutor session question state with the latest answer', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: null,
      questionIds: [questionId],
    });

    const sessionAttempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      sessionAttempts,
      sessions,
      new FakeLogger(),
      passthroughTransaction(sessionAttempts, sessions),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    const updated = await sessions.findByIdAndUserId(sessionId, userId);
    expect(updated?.questionStates).toEqual([
      {
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: 'c2',
        latestIsCorrect: true,
        latestAnsweredAt: expect.any(Date),
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      },
    ]);
  });

  it('throws INTERNAL_ERROR when session exists but writeTransaction is not provided', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'writeTransaction is required for session-backed submissions',
      ),
    );

    expect(attempts.getAll()).toEqual([]);
  });

  it('propagates error when recordQuestionAnswer fails inside transaction', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const transaction = async <T>(
      fn: (tx: {
        attempts: FakeAttemptRepository;
        sessions: FakePracticeSessionRepository;
      }) => Promise<T>,
    ): Promise<T> =>
      fn({
        attempts: new FakeAttemptRepository(),
        sessions: new FailingRecordSessionRepository([session]),
      });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
      transaction,
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(attempts.getAll()).toEqual([]);
  });

  it('throws CONFLICT when submitting to an ended tutor session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: new Date('2026-01-31T00:00:00Z'),
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Practice session already ended'),
    );

    expect(attempts.getAll()).toEqual([]);
  });

  it('throws NOT_FOUND when session is missing', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: true,
        }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'c1',
        sessionId: 'missing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when session belongs to another user', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          isCorrect: true,
        }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId: 'user-2',
      mode: 'tutor',
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c1',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws CONFLICT when the same question is submitted twice in the same session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      sessions,
      new FakeLogger(),
      passthroughTransaction(attempts, sessions),
    );

    // First submission succeeds
    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    // Second submission to the same question in the same session should fail
    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c1',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'This question has already been answered in this session',
      ),
    );

    // Only one attempt should exist
    expect(attempts.getAll()).toHaveLength(1);
  });
});
