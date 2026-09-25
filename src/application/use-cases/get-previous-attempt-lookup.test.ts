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

  it('returns null when attemptId is provided but does not exist', async () => {
    const question = createQuestion({
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
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        attemptId: 'attempt-missing',
      }),
    ).resolves.toBeNull();
  });

  it('returns null when attemptId belongs to a different user', async () => {
    const question = createQuestion({
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
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-user-1',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-user-2',
          userId: 'user-2',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        attemptId: 'attempt-user-2',
      }),
    ).resolves.toBeNull();
  });

  it('throws NOT_FOUND when attemptId does not match questionId (defense-in-depth)', async () => {
    const logger = new FakeLogger();

    const question = createQuestion({
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
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-q1',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-q2',
          userId: 'user-1',
          questionId: 'q2',
          selectedChoiceId: 'c1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([question]),
      logger,
    );

    const promise = useCase.execute({
      userId: 'user-1',
      questionId: 'q1',
      attemptId: 'attempt-q2',
    });

    await expect(promise).rejects.toBeInstanceOf(ApplicationError);
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(logger.warnCalls).toEqual([
      {
        context: {
          attemptId: 'attempt-q2',
          questionId: 'q1',
          attemptQuestionId: 'q2',
        },
        msg: 'Previous attempt does not match requested question',
      },
    ]);
  });

  it('fetches a specific attempt when attemptId is provided', async () => {
    const question = createQuestion({
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
    });

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
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        attemptId: 'attempt-1',
      }),
    ).resolves.toMatchObject({
      attemptId: 'attempt-1',
      selectedChoiceId: 'c1',
      isCorrect: false,
    });
  });

  it('fetches a session-scoped attempt when sessionId is provided', async () => {
    const question = createQuestion({
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
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-session-1',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: false,
          practiceSessionId: 'session-1',
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-session-2',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          practiceSessionId: 'session-2',
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      attemptId: 'attempt-session-1',
      selectedChoiceId: 'c1',
      isCorrect: false,
    });
  });

  it('rejects mixed attemptId and sessionId even when both references exist', async () => {
    const question = createQuestion({
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
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-session-1',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c1',
          isCorrect: false,
          practiceSessionId: 'session-1',
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-session-2',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          practiceSessionId: 'session-2',
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-latest',
          userId: 'user-1',
          questionId: 'q1',
          selectedChoiceId: 'c2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T13:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        attemptId: 'attempt-session-2',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Provide either attemptId or sessionId, not both',
      ),
    );
  });
});
