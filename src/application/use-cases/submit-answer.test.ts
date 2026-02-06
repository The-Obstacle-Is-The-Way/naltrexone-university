import { describe, expect, it } from 'vitest';
import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { AllChoiceLabels } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { SubmitAnswerUseCase } from './submit-answer';

class FailingRecordSessionRepository extends FakePracticeSessionRepository {
  async recordQuestionAnswer(): Promise<never> {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to persist practice session answer state',
    );
  }
}

describe('SubmitAnswerUseCase', () => {
  it('returns choice explanations in deterministic display order', async () => {
    const userId = 'user-1';
    const questionId = 'q1';
    const choices = [
      createChoice({
        id: 'c1',
        questionId,
        label: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        explanationMd: 'Why A is wrong',
        sortOrder: 1,
      }),
      createChoice({
        id: 'c2',
        questionId,
        label: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        explanationMd: 'Why B is correct',
        sortOrder: 2,
      }),
      createChoice({
        id: 'c3',
        questionId,
        label: 'C',
        textMd: 'Choice C',
        isCorrect: false,
        explanationMd: 'Why C is wrong',
        sortOrder: 3,
      }),
      createChoice({
        id: 'c4',
        questionId,
        label: 'D',
        textMd: 'Choice D',
        isCorrect: false,
        explanationMd: 'Why D is wrong',
        sortOrder: 4,
      }),
    ];

    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'General explanation',
      choices,
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
    });

    const stableInput = choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });
    const shuffled = shuffleWithSeed(
      stableInput,
      createQuestionSeed(userId, questionId),
    );

    expect(result.choiceExplanations.map((choice) => choice.choiceId)).toEqual(
      shuffled.map((choice) => choice.id),
    );
    expect(
      result.choiceExplanations.map((choice) => choice.displayLabel),
    ).toEqual(shuffled.map((_, index) => AllChoiceLabels[index]));
    expect(
      result.choiceExplanations.map((choice) => choice.explanationMd),
    ).toEqual(shuffled.map((choice) => choice.explanationMd));
  });

  it('inserts an attempt and returns explanation when not in an exam session', async () => {
    const userId = 'user-1';

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

    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository();
    const useCase = new SubmitAnswerUseCase(questions, attempts, sessions);

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctChoiceId).toBe('c2');
    expect(result.explanationMd).toBe('Because.');
    expect(result.choiceExplanations).toHaveLength(2);

    const inserted = attempts.getAll();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.practiceSessionId).toBeNull();
    expect(inserted[0]?.timeSpentSeconds).toBe(0);
  });

  it('stores timeSpentSeconds from input', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: 42,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(42);
  });

  it('clamps negative timeSpentSeconds to 0', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: -5,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when NaN', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: Number.NaN,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when Infinity', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: Number.POSITIVE_INFINITY,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when -Infinity', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: Number.NEGATIVE_INFINITY,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when not provided', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('returns isCorrect=false when an incorrect choice is selected', async () => {
    const userId = 'user-1';

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

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
    });

    expect(result.isCorrect).toBe(false);
    expect(result.correctChoiceId).toBe('c2');

    expect(attempts.getAll()[0]?.isCorrect).toBe(false);
  });

  it('returns null explanation for active exam session', async () => {
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
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository([session]),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    expect(result.explanationMd).toBeNull();
    expect(result.choiceExplanations).toEqual([]);
  });

  it('updates the persisted session question state with the latest answer', async () => {
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
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
    });

    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      sessions,
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
      },
    ]);
  });

  it('rolls back inserted attempt when session state persistence fails', async () => {
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
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FailingRecordSessionRepository([session]),
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
        'Failed to persist practice session answer state',
      ),
    );

    expect(attempts.getAll()).toEqual([]);
  });

  it('returns explanation when exam session has ended', async () => {
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

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository([session]),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    expect(result.explanationMd).toBe('Because.');
  });

  it('throws NOT_FOUND when question is not published', async () => {
    const attempts = new FakeAttemptRepository();

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          status: 'draft',
          choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
        }),
      ]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'c1',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when question is missing', async () => {
    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'missing',
        choiceId: 'c1',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when choice does not belong to question', async () => {
    const attempts = new FakeAttemptRepository();
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'missing',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Choice not found'));

    expect(attempts.getAll()).toHaveLength(0);
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
});
