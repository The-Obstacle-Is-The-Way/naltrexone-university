import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { GetPreviousAttemptUseCase } from './get-previous-attempt';

describe('GetPreviousAttemptUseCase', () => {
  it('returns kind=session_unanswered with answer key when session question is unanswered in ended session', async () => {
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
          explanationMd: 'Why A is wrong',
        }),
        createChoice({
          id: 'c2',
          questionId: 'q1',
          label: 'B',
          isCorrect: true,
          explanationMd: 'Why B is correct',
        }),
      ],
    });

    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: 'c9',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-02-01T12:05:00Z'),
        },
      ],
      endedAt: new Date('2026-02-01T12:10:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([session]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      kind: 'session_unanswered',
      correctChoiceId: 'c2',
      explanationMd: 'General explanation',
    });
  });

  it('includes referenceMd in kind=session_unanswered payload when question has reference content', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      explanationMd: 'General explanation',
      referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId: 'q1',
          label: 'B',
          isCorrect: true,
        }),
      ],
    });

    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      questionIds: ['q1'],
      endedAt: new Date('2026-02-01T12:10:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([session]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      kind: 'session_unanswered',
      referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    });
  });

  it('returns null for unanswered question when session is still active', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId: 'q1',
          label: 'B',
          isCorrect: true,
        }),
      ],
    });

    const activeSession = createPracticeSession({
      id: 'session-active',
      userId: 'user-1',
      questionIds: ['q1'],
      endedAt: null,
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([activeSession]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-active',
      }),
    ).resolves.toBeNull();
  });

  it('returns null when attemptId belongs to an active exam session', async () => {
    const userId = 'user-1';
    const questionId = 'q1';
    const sessionId = 'session-active';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId,
          label: 'B',
          isCorrect: true,
        }),
      ],
    });

    const activeSession = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      questionIds: [questionId],
      endedAt: null,
    });

    const attempt = createAttempt({
      id: 'attempt-active-session',
      userId,
      questionId,
      practiceSessionId: sessionId,
      selectedChoiceId: 'c2',
      isCorrect: true,
      answeredAt: new Date('2026-02-01T12:00:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([attempt]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([activeSession]),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        attemptId: 'attempt-active-session',
      }),
    ).resolves.toBeNull();
  });

  it('returns null when latest attempt belongs to an active exam session', async () => {
    const userId = 'user-1';
    const questionId = 'q1';
    const sessionId = 'session-active';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId,
          label: 'B',
          isCorrect: true,
        }),
      ],
    });

    const activeSession = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      questionIds: [questionId],
      endedAt: null,
    });

    const attempt = createAttempt({
      id: 'attempt-active-latest',
      userId,
      questionId,
      practiceSessionId: sessionId,
      selectedChoiceId: 'c2',
      isCorrect: true,
      answeredAt: new Date('2026-02-01T12:00:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([attempt]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([activeSession]),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
      }),
    ).resolves.toBeNull();
  });

  it('returns null for unanswered question when question is not in session', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId: 'q1',
          label: 'B',
          isCorrect: true,
        }),
      ],
    });

    const endedSessionWithoutQuestion = createPracticeSession({
      id: 'session-ended-missing-question',
      userId: 'user-1',
      questionIds: ['q2'],
      endedAt: new Date('2026-02-01T12:10:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([endedSessionWithoutQuestion]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-ended-missing-question',
      }),
    ).resolves.toBeNull();
  });

  it('throws VALIDATION_ERROR when both attemptId and sessionId are provided', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId: 'q1',
          label: 'B',
          isCorrect: true,
        }),
      ],
    });

    const endedSession = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      questionIds: ['q1'],
      endedAt: new Date('2026-02-01T12:10:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([endedSession]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        attemptId: 'attempt-missing',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Provide either attemptId or sessionId, not both',
      ),
    );
  });

  it('returns null when sessionId is provided but session is not found', async () => {
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([]),
      new FakeLogger(),
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-ghost',
      }),
    ).resolves.toBeNull();
  });

  it('returns null and logs warning when session unanswered reveal references missing question', async () => {
    const logger = new FakeLogger();
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      questionIds: ['q1'],
      endedAt: new Date('2026-02-01T12:10:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([]),
      logger,
      new FakePracticeSessionRepository([session]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-1',
      }),
    ).resolves.toBeNull();

    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: 'q1', sessionId: 'session-1' },
        msg: 'Session unanswered reveal references missing question',
      },
    ]);
  });

  it('throws INTERNAL_ERROR when session unanswered reveal question has no correct choice', async () => {
    const question = createQuestion({
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
    });

    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      questionIds: ['q1'],
      endedAt: new Date('2026-02-01T12:10:00Z'),
    });

    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
      new FakePracticeSessionRepository([session]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Question q1 has no correct choice',
    } satisfies Partial<ApplicationError>);
  });

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

  // Tie-breaking relies on lexicographic DESC ordering: 'attempt-b' > 'attempt-a'.
  // FakeAttemptRepository sorts by (answeredAt DESC, id DESC) matching Drizzle impl.
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

  it('returns explanationMd and referenceMd from the question entity', async () => {
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
          referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
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
      referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
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

  it('returns the older visible attempt supplied by the implicit latest reader', async () => {
    const userId = 'user-1';
    const questionId = 'q1';
    const answeredAt = new Date('2026-04-25T12:00:00.000Z');
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Visible explanation',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          isCorrect: false,
        }),
        createChoice({
          id: 'c2',
          questionId,
          label: 'B',
          isCorrect: true,
        }),
      ],
    });
    const useCase = new GetPreviousAttemptUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-visible',
          userId,
          questionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
          answeredAt,
        }),
      ]),
      new FakeQuestionRepository([question]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId, questionId }),
    ).resolves.toMatchObject({
      kind: 'attempt',
      attemptId: 'attempt-visible',
      selectedChoiceId: 'c1',
      isCorrect: false,
      answeredAt: answeredAt.toISOString(),
    });
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
