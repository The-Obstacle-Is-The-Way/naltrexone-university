import { describe, expect, it } from 'vitest';
import {
  AttemptConflictMessages,
  PracticeSessionConflictMessages,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';
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
  STATE_CHANGED_CONCURRENTLY_MESSAGE,
  SubmitAnswerUseCase,
} from '../test-helpers/submit-answer-test-helpers';

// ADR-021: the current revision offers c3/c4, the item was bound to c1/c2.
function createRevisedSessionFixture() {
  const userId = 'user-1';
  const sessionId = 'session-1';
  const questionId = 'q1';
  const current = createQuestion({
    id: questionId,
    explanationMd: 'Current explanation',
    choices: [
      createChoice({ id: 'c3', questionId, label: 'C', isCorrect: true }),
      createChoice({ id: 'c4', questionId, label: 'D', isCorrect: false }),
    ],
  });
  const bound = createQuestion({
    id: questionId,
    revisionId: crypto.randomUUID(),
    explanationMd: 'Bound explanation',
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
    questionStates: [
      {
        questionId,
        questionRevisionId: bound.revisionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      },
    ],
  });
  const attempts = new FakeAttemptRepository();
  const sessions = new FakePracticeSessionRepository([session]);
  const useCase = new SubmitAnswerUseCase(
    new FakeQuestionRepository([current, bound]),
    attempts,
    sessions,
    new FakeLogger(),
    passthroughTransaction(attempts, sessions),
  );
  return {
    userId,
    sessionId,
    questionId,
    boundRevisionId: bound.revisionId,
    attempts,
    useCase,
  };
}

describe('SubmitAnswerUseCase', () => {
  it('grades a session answer against the revision the item was bound to', async () => {
    const { userId, sessionId, questionId, useCase } =
      createRevisedSessionFixture();

    await expect(
      useCase.execute({ userId, questionId, choiceId: 'c2', sessionId }),
    ).resolves.toMatchObject({
      isCorrect: true,
      correctChoiceId: 'c2',
      explanationMd: 'Bound explanation',
    });
  });

  it('records the bound revision it graded on the attempt', async () => {
    const {
      userId,
      sessionId,
      questionId,
      boundRevisionId,
      attempts,
      useCase,
    } = createRevisedSessionFixture();

    await useCase.execute({ userId, questionId, choiceId: 'c2', sessionId });

    expect(attempts.getAll().map((a) => a.questionRevisionId)).toEqual([
      boundRevisionId,
    ]);
  });

  it('refuses a choice of another revision in a session bound to an older one', async () => {
    const { userId, sessionId, questionId, attempts, useCase } =
      createRevisedSessionFixture();

    await expect(
      useCase.execute({ userId, questionId, choiceId: 'c3', sessionId }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Choice not found'));
    expect(attempts.getAll()).toEqual([]);
  });

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
        questionRevisionId: question.revisionId,
        markedForReview: false,
        latestSelectedChoiceId: 'c2',
        latestIsCorrect: true,
        latestAnsweredAt: expect.any(Date),
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
        fairChanceAtEnd: null,
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

  it('propagates transient state-write CONFLICT when recordQuestionAnswer fails inside transaction', async () => {
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
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', STATE_CHANGED_CONCURRENTLY_MESSAGE),
    );

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
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: PracticeSessionConflictMessages.AlreadyEnded,
      details: { reason: PracticeSessionConflictReasons.AlreadyEnded },
    });

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
        AttemptConflictMessages.AlreadyAnsweredInSession,
      ),
    );

    // Only one attempt should exist
    expect(attempts.getAll()).toHaveLength(1);
  });
});
