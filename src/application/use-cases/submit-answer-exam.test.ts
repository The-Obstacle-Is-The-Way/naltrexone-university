import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  createChoice,
  createPracticeSession,
  createQuestion,
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  passthroughTransaction,
  SubmitAnswerUseCase,
} from './submit-answer-test-helpers';

describe('SubmitAnswerUseCase', () => {
  it('rejects active exam sessions before inserting an attempt or recording an answer', async () => {
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
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
      questionStates: [
        {
          questionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'c1',
          draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
          draftCumulativeMs: 12_000,
        },
      ],
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

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Per-question submit is not available in exam mode',
      ),
    );

    expect(attempts.getAll()).toEqual([]);
    const unchanged = await sessions.findByIdAndUserId(sessionId, userId);
    expect(unchanged?.questionStates).toEqual([
      {
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: 'c1',
        draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
        draftCumulativeMs: 12_000,
      },
    ]);
  });

  it('throws CONFLICT when submitting to an ended exam session', async () => {
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
      mode: 'exam',
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

  it('throws NOT_FOUND when session exists but question is not part of the session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-02-07T00:00:00Z'),
      questionIds: ['q1'],
    });

    const question = createQuestion({
      id: 'q2',
      status: 'published',
      choices: [
        createChoice({
          id: 'c2',
          questionId: 'q2',
          label: 'A',
          isCorrect: true,
        }),
      ],
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
        questionId: 'q2',
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      ),
    );

    expect(attempts.getAll()).toHaveLength(0);
  });
});
