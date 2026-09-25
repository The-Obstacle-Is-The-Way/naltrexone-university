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
});
