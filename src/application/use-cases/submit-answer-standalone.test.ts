import { describe, expect, it } from 'vitest';
import {
  AllChoiceLabels,
  ApplicationError,
  createChoice,
  createQuestion,
  createQuestionSeed,
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  SubmitAnswerUseCase,
  shuffleWithSeed,
} from './submit-answer-test-helpers';

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
      new FakeLogger(),
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

  it('inserts an attempt and returns explanation for standalone submissions', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository();
    const useCase = new SubmitAnswerUseCase(
      questions,
      attempts,
      sessions,
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctChoiceId).toBe('c2');
    expect(result.explanationMd).toBe('Because.');
    expect(result.referenceMd).toBe(
      'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    );
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
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: 42,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(42);
  });

  it('caps timeSpentSeconds at 86_400 seconds (24h)', async () => {
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
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: 999_999,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(86_400);
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
      new FakeLogger(),
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
});
