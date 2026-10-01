import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import type { Attempt, Question } from '@/src/domain/entities';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from './get-completed-session-questions-with-feedback';

class ThrowingWarnLogger extends FakeLogger {
  override warn(): void {
    throw new Error('logger unavailable');
  }
}

function createCorrectnessComparisonFixture(input: {
  attemptIsCorrect: boolean | undefined;
  stateIsCorrect: boolean | null;
  logger?: FakeLogger;
}) {
  const userId = 'user-1';
  const sessionId = 'session-1';
  const questionId = 'q1';
  const choiceId = 'q1-choice-a';
  const question = createQuestion({
    id: questionId,
    slug: 'q-1',
    choices: [
      createChoice({
        id: choiceId,
        questionId,
        label: 'A',
        isCorrect: true,
      }),
    ],
  });
  const session = createPracticeSession({
    id: sessionId,
    userId,
    mode: 'exam',
    endedAt: new Date('2026-03-19T12:00:00.000Z'),
    questionIds: [questionId],
    questionStates: [
      {
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: choiceId,
        latestIsCorrect: input.stateIsCorrect,
        latestAnsweredAt:
          input.stateIsCorrect === null
            ? null
            : new Date('2026-03-19T11:58:00.000Z'),
      },
    ],
  });
  const attempts =
    input.attemptIsCorrect === undefined
      ? []
      : [
          createAttempt({
            id: 'attempt-1',
            userId,
            questionId,
            practiceSessionId: sessionId,
            selectedChoiceId: choiceId,
            isCorrect: input.attemptIsCorrect,
          }),
        ];
  const logger = input.logger ?? new FakeLogger();

  return {
    userId,
    sessionId,
    logger,
    useCase: new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(attempts),
      logger,
    ),
  };
}

// An exam over one question with every item unanswered, ended unless
// `endedAt` says otherwise, and the learner's attempts in it.
function examOver(
  question: Question,
  options: { attempts?: Attempt[]; endedAt?: Date | null } = {},
) {
  return new GetCompletedSessionQuestionsWithFeedbackUseCase(
    new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        endedAt:
          options.endedAt === undefined
            ? new Date('2026-03-19T12:00:00Z')
            : options.endedAt,
        questionIds: [question.id],
      }),
    ]),
    new FakeQuestionRepository([question]),
    new FakeAttemptRepository(options.attempts ?? []),
    new FakeLogger(),
  );
}

describe('GetCompletedSessionQuestionsWithFeedbackUseCase', () => {
  it('keeps a withdrawn question reviewable, as answered, and marks it withdrawn (ADR-021 §3)', async () => {
    const withdrawn = createQuestion({
      id: 'q1',
      slug: 'q-1',
      status: 'archived',
      stemMd: 'Answered stem',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: true,
        }),
      ],
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00.000Z'),
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-03-19T11:58:00.000Z'),
        },
      ],
    });
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([withdrawn]),
      new FakeAttemptRepository([]),
      new FakeLogger(),
    );

    const output = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(output.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        withdrawn: true,
        stemMd: 'Answered stem',
        correctChoiceId: 'c1',
      }),
    ]);
  });

  // Pattern Registry F-12: a newer revision replaced the one the session was
  // bound to. A withdrawn question is marked withdrawn only.
  it.each([
    ['published', { withdrawn: false, superseded: true }],
    ['archived', { withdrawn: true, superseded: false }],
  ] as const)(
    'marks a row of a %s question whose bound revision is no longer current',
    async (status, marks) => {
      const choice = createChoice({
        id: 'c1',
        questionId: 'q1',
        isCorrect: true,
      });
      const current = createQuestion({ id: 'q1', slug: 'q-1', status });
      const bound = createQuestion({
        id: 'q1',
        revisionId: crypto.randomUUID(),
        slug: 'q-1',
        status,
        stemMd: 'Bound stem',
        choices: [choice],
      });
      const session = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'tutor',
        endedAt: new Date('2026-03-19T12:00:00.000Z'),
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            questionRevisionId: bound.revisionId,
            markedForReview: false,
            latestSelectedChoiceId: 'c1',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-03-19T11:58:00.000Z'),
          },
        ],
      });
      const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
        new FakePracticeSessionRepository([session]),
        new FakeQuestionRepository([current, bound]),
        new FakeAttemptRepository([]),
        new FakeLogger(),
      );

      const output = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(output.rows).toEqual([
        expect.objectContaining({ stemMd: 'Bound stem', ...marks }),
      ]);
    },
  );

  // ADR-021 §3: the learner saw the item but never attempted it.
  it('keeps a withdrawn question the learner left unanswered unavailable, without a missing-question warning', async () => {
    const logger = new FakeLogger();
    const withdrawn = createQuestion({
      id: 'q1',
      status: 'archived',
      choices: [createChoice({ questionId: 'q1', isCorrect: true })],
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      endedAt: new Date('2026-03-19T12:00:00.000Z'),
      questionIds: ['q1'],
    });
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([withdrawn]),
      new FakeAttemptRepository([]),
      logger,
    );

    const output = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(output.rows).toEqual([
      {
        isAvailable: false,
        questionId: 'q1',
        order: 1,
        isAnswered: false,
        isCorrect: null,
        isOmitted: false,
        markedForReview: false,
      },
    ]);
    expect(logger.warnCalls).toEqual([]);
  });

  it('warns on attempt-state correctness divergence while preserving the attempt-preferred output', async () => {
    const fixture = createCorrectnessComparisonFixture({
      attemptIsCorrect: true,
      stateIsCorrect: false,
    });

    const output = await fixture.useCase.execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });

    expect(output.rows[0]).toMatchObject({ isCorrect: true });
    expect(fixture.logger.warnCalls).toEqual([
      {
        context: {
          sessionId: fixture.sessionId,
          questionId: 'q1',
          attemptIsCorrect: true,
          stateLatestIsCorrect: false,
        },
        msg: 'Attempt correctness diverges from practice session question state',
      },
    ]);
  });

  it('does not warn when attempt and state correctness agree', async () => {
    const fixture = createCorrectnessComparisonFixture({
      attemptIsCorrect: false,
      stateIsCorrect: false,
    });

    await fixture.useCase.execute({
      userId: fixture.userId,
      sessionId: fixture.sessionId,
    });

    expect(fixture.logger.warnCalls).toEqual([]);
  });

  it.each([
    {
      name: 'the attempt is missing',
      attemptIsCorrect: undefined,
      stateIsCorrect: true,
    },
    {
      name: 'the state is ungraded',
      attemptIsCorrect: true,
      stateIsCorrect: null,
    },
  ])(
    'does not warn when $name',
    async ({ attemptIsCorrect, stateIsCorrect }) => {
      const fixture = createCorrectnessComparisonFixture({
        attemptIsCorrect,
        stateIsCorrect,
      });

      await fixture.useCase.execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
      });

      expect(fixture.logger.warnCalls).toEqual([]);
    },
  );

  it('preserves the attempt-preferred output when divergence logging fails', async () => {
    const fixture = createCorrectnessComparisonFixture({
      attemptIsCorrect: true,
      stateIsCorrect: false,
      logger: new ThrowingWarnLogger(),
    });

    await expect(
      fixture.useCase.execute({
        userId: fixture.userId,
        sessionId: fixture.sessionId,
      }),
    ).resolves.toMatchObject({ rows: [{ isCorrect: true }] });
  });

  it('returns full feedback rows for a completed exam session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const questionOne = createQuestion({
      id: 'q1',
      slug: 'q-1',
      stemMd: 'Stem for q1',
      difficulty: 'easy',
      explanationMd: 'Overall explanation for q1',
      referenceMd: 'Reference for q1',
      choices: [
        createChoice({
          id: 'q1-choice-a',
          questionId: 'q1',
          label: 'A',
          textMd: 'Q1 choice A',
          explanationMd: 'Why A is wrong',
          isCorrect: false,
          sortOrder: 1,
        }),
        createChoice({
          id: 'q1-choice-b',
          questionId: 'q1',
          label: 'B',
          textMd: 'Q1 choice B',
          explanationMd: 'Why B is right',
          isCorrect: true,
          sortOrder: 2,
        }),
      ],
    });
    const questionTwo = createQuestion({
      id: 'q2',
      slug: 'q-2',
      stemMd: 'Stem for q2',
      difficulty: 'hard',
      explanationMd: 'Overall explanation for q2',
      referenceMd: 'Reference for q2',
      choices: [
        createChoice({
          id: 'q2-choice-a',
          questionId: 'q2',
          label: 'A',
          textMd: 'Q2 choice A',
          explanationMd: 'Why A is correct',
          isCorrect: true,
          sortOrder: 1,
        }),
        createChoice({
          id: 'q2-choice-b',
          questionId: 'q2',
          label: 'B',
          textMd: 'Q2 choice B',
          explanationMd: 'Why B is wrong',
          isCorrect: false,
          sortOrder: 2,
        }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00Z'),
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'q1-choice-a',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-03-19T11:58:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });

    const attempts = new FakeAttemptRepository([
      createAttempt({
        id: 'attempt-1',
        userId,
        questionId: 'q1',
        practiceSessionId: sessionId,
        selectedChoiceId: 'q1-choice-a',
        isCorrect: false,
        answeredAt: new Date('2026-03-19T11:58:00Z'),
      }),
    ]);

    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([questionOne, questionTwo]),
      attempts,
      new FakeLogger(),
    );

    const output = await useCase.execute({ userId, sessionId });

    expect(output).toMatchObject({
      sessionId,
      mode: 'exam',
      totalCount: 2,
      answeredCount: 1,
      markedCount: 1,
    });
    expect(output.rows).toHaveLength(2);

    expect(output.rows[0]).toMatchObject({
      isAvailable: true,
      questionId: 'q1',
      slug: 'q-1',
      order: 1,
      isAnswered: true,
      isCorrect: false,
      selectedChoiceId: 'q1-choice-a',
      correctChoiceId: 'q1-choice-b',
      explanationMd: 'Overall explanation for q1',
      referenceMd: 'Reference for q1',
    });
    if (!output.rows[0]?.isAvailable) {
      throw new Error('Expected first row to be available');
    }
    expect(output.rows[0].choices).toHaveLength(2);
    expect(output.rows[0].choices.map((choice) => choice.id)).toEqual([
      'q1-choice-b',
      'q1-choice-a',
    ]);
    expect(output.rows[0].choiceExplanations).toHaveLength(2);
    expect(
      output.rows[0].choiceExplanations.map((choice) => choice.choiceId),
    ).toEqual(['q1-choice-b', 'q1-choice-a']);

    expect(output.rows[1]).toMatchObject({
      isAvailable: true,
      questionId: 'q2',
      slug: 'q-2',
      order: 2,
      isAnswered: false,
      isCorrect: null,
      isOmitted: false,
      markedForReview: true,
      selectedChoiceId: null,
      correctChoiceId: 'q2-choice-a',
      explanationMd: 'Overall explanation for q2',
      referenceMd: 'Reference for q2',
    });
    if (!output.rows[1]?.isAvailable) {
      throw new Error('Expected second row to be available');
    }
    expect(output.rows[1].choices).toHaveLength(2);
    expect(output.rows[1].choices.map((choice) => choice.id)).toEqual([
      'q2-choice-a',
      'q2-choice-b',
    ]);
    expect(output.rows[1].choiceExplanations).toHaveLength(2);
    expect(
      output.rows[1].choiceExplanations.map((choice) => choice.choiceId),
    ).toEqual(['q2-choice-a', 'q2-choice-b']);
  });

  it('throws CONFLICT when the session is still in progress', async () => {
    await expect(
      examOver(createQuestion({ id: 'q1' }), { endedAt: null }).execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'Practice session must be completed before feedback can be loaded',
      ),
    );
  });

  it('throws INTERNAL_ERROR when normalized question state is missing', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00Z'),
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });

    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
        createQuestion({
          id: 'q2',
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'easy',
        }),
      ]),
      new FakeAttemptRepository([]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('returns omitted attempts as incorrect feedback rows without a selected choice', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const question = createQuestion({
      id: 'q1',
      slug: 'q-1',
      stemMd: 'Stem for q1',
      difficulty: 'easy',
      explanationMd: 'Overall explanation',
      choices: [
        createChoice({
          id: 'q1-choice-a',
          questionId: 'q1',
          label: 'A',
          textMd: 'Q1 choice A',
          isCorrect: false,
          sortOrder: 1,
        }),
        createChoice({
          id: 'q1-choice-b',
          questionId: 'q1',
          label: 'B',
          textMd: 'Q1 choice B',
          isCorrect: true,
          sortOrder: 2,
        }),
      ],
    });
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00Z'),
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-03-19T11:58:00Z'),
        },
      ],
    });
    const attempts = new FakeAttemptRepository([
      createAttempt({
        id: 'attempt-omitted',
        userId,
        questionId: 'q1',
        practiceSessionId: sessionId,
        outcome: omittedOutcome(),
        isCorrect: false,
        answeredAt: new Date('2026-03-19T11:58:00Z'),
      }),
    ]);

    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([question]),
      attempts,
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        answeredCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'q1',
            isAnswered: false,
            isCorrect: false,
            isOmitted: true,
            selectedChoiceId: null,
          },
        ],
      },
    );
  });

  it('returns an unavailable row when a completed session references a missing question', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const availableQuestion = createQuestion({
      id: 'q1',
      slug: 'q-1',
      stemMd: 'Stem for q1',
      difficulty: 'easy',
      explanationMd: 'Overall explanation for q1',
      referenceMd: 'Reference for q1',
      choices: [
        createChoice({
          id: 'q1-choice-a',
          questionId: 'q1',
          label: 'A',
          textMd: 'Q1 choice A',
          explanationMd: 'Why A is correct',
          isCorrect: true,
          sortOrder: 1,
        }),
      ],
    });
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-03-19T12:00:00Z'),
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'q1-choice-a',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-03-19T11:58:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });

    const logger = new FakeLogger();
    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([availableQuestion]),
      new FakeAttemptRepository([]),
      logger,
    );

    const output = await useCase.execute({ userId, sessionId });

    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: 'q2' },
        msg: 'Completed session feedback references missing question',
      },
    ]);
    expect(output.rows).toHaveLength(2);
    expect(output.rows[0]).toMatchObject({
      isAvailable: true,
      questionId: 'q1',
      order: 1,
      isAnswered: true,
      isCorrect: true,
    });
    expect(output.rows[1]).toEqual({
      isAvailable: false,
      questionId: 'q2',
      order: 2,
      isAnswered: false,
      isCorrect: null,
      isOmitted: false,
      markedForReview: true,
    });
  });

  it('returns NOT_FOUND when the session does not exist', async () => {
    await expect(
      examOver(createQuestion()).execute({
        userId: 'user-1',
        sessionId: 'missing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  // ADR-021 §3: an attempt in the session is enough to show a withdrawn
  // question, even where the item's state recorded no answer.
  it('keeps a withdrawn question reviewable when the attempt is the only record of an answer', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'archived',
      choices: [
        createChoice({ id: 'q1-a', questionId: 'q1', isCorrect: true }),
      ],
    });
    const attempt = createAttempt({
      userId: 'user-1',
      questionId: 'q1',
      practiceSessionId: 'session-1',
      selectedChoiceId: 'q1-a',
    });

    await expect(
      examOver(question, { attempts: [attempt] }).execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      rows: [{ isAvailable: true, withdrawn: true, selectedChoiceId: 'q1-a' }],
    });
  });

  it('fails loudly for a question without a correct choice', async () => {
    const question = createQuestion({
      id: 'q1',
      choices: [createChoice({ questionId: 'q1', isCorrect: false })],
    });

    await expect(
      examOver(question).execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Question q1 has no correct choice',
      ),
    );
  });
});
