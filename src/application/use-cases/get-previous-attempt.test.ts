import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createChoice,
  createQuestion,
} from '@/src/domain/test-helpers';
import { GetPreviousAttemptUseCase } from './get-previous-attempt';

describe('GetPreviousAttemptUseCase', () => {
  it('returns null when user has no attempts for the question', async () => {
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'q1' }),
    ).resolves.toBeNull();
  });

  it('returns previous attempt data with correct choice, explanation, and choice explanations', async () => {
    const attempt = createAttempt({
      id: 'attempt-1',
      userId: 'user-1',
      questionId: 'q1',
      selectedChoiceId: 'c1',
      isCorrect: false,
      answeredAt: new Date('2026-02-01T12:00:00Z'),
    });

    const question = createQuestion({
      id: 'q1',
      status: 'published',
      explanationMd: 'General explanation',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: false,
          sortOrder: 1,
          explanationMd: 'Why A is wrong',
        }),
        createChoice({
          id: 'c2',
          questionId: 'q1',
          label: 'B',
          isCorrect: true,
          sortOrder: 2,
          explanationMd: 'Why B is correct',
        }),
      ],
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([attempt]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-1',
      questionId: 'q1',
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected previous attempt output.');
    }

    expect(result).toMatchObject({
      attemptId: 'attempt-1',
      selectedChoiceId: 'c1',
      isCorrect: false,
      correctChoiceId: 'c2',
      explanationMd: 'General explanation',
      answeredAt: '2026-02-01T12:00:00.000Z',
      choiceExplanations: expect.any(Array),
    });
    expect(
      result.choiceExplanations.map((choice) => choice.choiceId).sort(),
    ).toEqual(['c1', 'c2']);
  });

  it('returns the most recent attempt when multiple attempts exist for the same question', async () => {
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          status: 'published',
          choices: [
            createChoice({ id: 'c1', questionId: 'q1', label: 'A' }),
            createChoice({
              id: 'c2',
              questionId: 'q1',
              label: 'B',
              isCorrect: true,
            }),
          ],
        }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'q1' }),
    ).resolves.toMatchObject({
      attemptId: 'attempt-2',
      selectedChoiceId: 'c2',
      isCorrect: true,
    });
  });

  it('breaks ties by id DESC when multiple attempts share the same answeredAt', async () => {
    const answeredAt = new Date('2026-02-01T12:00:00Z');
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-a',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: false,
          answeredAt,
        }),
        createAttempt({
          id: 'attempt-b',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt,
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          status: 'published',
          choices: [
            createChoice({ id: 'c1', questionId: 'q1', label: 'A' }),
            createChoice({
              id: 'c2',
              questionId: 'q1',
              label: 'B',
              isCorrect: true,
            }),
          ],
        }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'q1' }),
    ).resolves.toMatchObject({
      attemptId: 'attempt-b',
      selectedChoiceId: 'c2',
      isCorrect: true,
    });
  });

  it('returns null and logs warning when question is missing (orphaned attempt)', async () => {
    const logger = new FakeLogger();
    const orphanedQuestionId = 'q-orphaned';

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: orphanedQuestionId,
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([]),
      logger,
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: orphanedQuestionId }),
    ).resolves.toBeNull();

    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Previous attempt references missing question',
      },
    ]);
  });

  it('throws INTERNAL_ERROR when the question has no correct choice', async () => {
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: false,
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          status: 'published',
          choices: [
            createChoice({
              id: 'c1',
              questionId: 'q1',
              label: 'A',
              isCorrect: false,
            }),
          ],
        }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'q1' }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Question q1 has no correct choice',
    } satisfies Partial<ApplicationError>);
  });

  it('returns explanationMd from the question entity', async () => {
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: true,
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          status: 'published',
          explanationMd: 'Because.',
          choices: [
            createChoice({
              id: 'c1',
              questionId: 'q1',
              label: 'A',
              isCorrect: true,
            }),
          ],
        }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'q1' }),
    ).resolves.toMatchObject({
      explanationMd: 'Because.',
    });
  });

  it('uses buildShuffledChoiceViews for consistent choice order', async () => {
    const userId = 'user-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          textMd: 'Choice 1',
          isCorrect: false,
          explanationMd: 'Why A is wrong',
          sortOrder: 1,
        }),
        createChoice({
          id: 'c2',
          questionId,
          label: 'B',
          textMd: 'Choice 2',
          isCorrect: true,
          explanationMd: 'Why B is correct',
          sortOrder: 2,
        }),
        createChoice({
          id: 'c3',
          questionId,
          label: 'C',
          textMd: 'Choice 3',
          isCorrect: false,
          explanationMd: 'Why C is wrong',
          sortOrder: 3,
        }),
        createChoice({
          id: 'c4',
          questionId,
          label: 'D',
          textMd: 'Choice 4',
          isCorrect: false,
          explanationMd: 'Why D is wrong',
          sortOrder: 4,
        }),
      ],
    });

    const expected = [
      {
        choiceId: 'c1',
        displayLabel: 'A',
        textMd: 'Choice 1',
        isCorrect: false,
        explanationMd: 'Why A is wrong',
      },
      {
        choiceId: 'c3',
        displayLabel: 'B',
        textMd: 'Choice 3',
        isCorrect: false,
        explanationMd: 'Why C is wrong',
      },
      {
        choiceId: 'c4',
        displayLabel: 'C',
        textMd: 'Choice 4',
        isCorrect: false,
        explanationMd: 'Why D is wrong',
      },
      {
        choiceId: 'c2',
        displayLabel: 'D',
        textMd: 'Choice 2',
        isCorrect: true,
        explanationMd: 'Why B is correct',
      },
    ];

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId,
          questionId,
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    const result = await useCase.execute({ userId, questionId });
    expect(result?.choiceExplanations).toEqual(expected);
  });

  it('propagates repository failures', async () => {
    class FailingAttemptRepository extends FakeAttemptRepository {
      async findLatestByUserAndQuestion(): Promise<never> {
        throw new ApplicationError('INTERNAL_ERROR', 'Repository failure');
      }
    }

    const useCase = new GetPreviousAttemptUseCase(
      new FailingAttemptRepository([]),
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'q1' }),
    ).rejects.toThrow('Repository failure');
  });
});
