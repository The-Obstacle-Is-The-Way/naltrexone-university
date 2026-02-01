import { describe, expect, it } from 'vitest';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { SubmitAnswerUseCase } from './submit-answer';

describe('SubmitAnswerUseCase', () => {
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

    const inserted = attempts.getAll();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.practiceSessionId).toBeNull();
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
  });

  it('throws NOT_FOUND when question is missing', async () => {
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'missing',
        choiceId: 'c1',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });

  it('throws NOT_FOUND when choice does not belong to question', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'missing',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Choice not found'));
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

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
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
  });
});
