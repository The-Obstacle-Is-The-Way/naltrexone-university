import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
import type { PracticeSession } from '@/src/domain/entities';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';

class MismatchedStatePracticeSessionRepository extends FakePracticeSessionRepository {
  constructor(private readonly session: PracticeSession) {
    super([]);
  }

  override async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PracticeSession | null> {
    if (this.session.id !== id || this.session.userId !== userId) {
      return null;
    }
    return this.session;
  }
}

describe('GetPracticeSessionReviewUseCase', () => {
  it('reviews an item as the revision it was bound to (ADR-021)', async () => {
    const current = createQuestion({
      id: 'q1',
      slug: 'q-1',
      stemMd: 'Current stem',
      difficulty: 'hard',
    });
    const bound = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      slug: 'q-1',
      stemMd: 'Bound stem',
      difficulty: 'easy',
    });
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          questionRevisionId: bound.revisionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });
    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([current, bound]),
      new FakeLogger(),
    );

    const review = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(review.rows[0]).toMatchObject({
      isAvailable: true,
      stemMd: 'Bound stem',
      difficulty: 'easy',
    });
  });

  // ADR-021 §3: a withdrawn question stays reviewable only by a learner who
  // attempted it, and only once the session is over (slice 3 covers a
  // session still in progress).
  describe('an item whose question was withdrawn since', () => {
    const withdrawn = createQuestion({
      id: 'q1',
      slug: 'q-1',
      status: 'archived',
      stemMd: 'Answered stem',
    });
    // `omitted`: an exam finalized the item unanswered, recording it as
    // omitted and incorrect with an answer time.
    function reviewOf(input: {
      ended: boolean;
      answered: boolean;
      omitted?: boolean;
    }) {
      const logger = new FakeLogger();
      const session = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: input.omitted ? 'exam' : 'tutor',
        endedAt: input.ended ? new Date('2026-09-01T00:00:00Z') : null,
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: input.answered ? 'c1' : null,
            latestIsCorrect: input.answered || input.omitted ? false : null,
            latestAnsweredAt:
              input.answered || input.omitted
                ? new Date('2026-08-31T00:00:00Z')
                : null,
          },
        ],
      });
      const useCase = new GetPracticeSessionReviewUseCase(
        new FakePracticeSessionRepository([session]),
        new FakeQuestionRepository([withdrawn]),
        logger,
      );
      return {
        logger,
        review: useCase.execute({ userId: 'user-1', sessionId: 'session-1' }),
      };
    }

    it('is available and marked withdrawn once the session ended, if the learner answered it', async () => {
      const { review } = reviewOf({ ended: true, answered: true });

      await expect(review).resolves.toMatchObject({
        rows: [
          {
            isAvailable: true,
            withdrawn: true,
            slug: 'q-1',
            stemMd: 'Answered stem',
          },
        ],
      });
    });

    it.each([
      ['left unanswered in an ended session', { ended: true, answered: false }],
      ['in a session still in progress', { ended: false, answered: true }],
      // ADR-022 Decision 2: an omitted item is not an answer.
      [
        'omitted by an ended exam',
        { ended: true, answered: false, omitted: true },
      ],
    ])(
      'stays unavailable, without a missing-question warning, when %s',
      async (_name, input) => {
        const { review, logger } = reviewOf(input);

        await expect(review).resolves.toMatchObject({
          rows: [{ isAvailable: false, questionId: 'q1' }],
        });
        expect((await review).rows[0]).not.toHaveProperty('stemMd');
        expect(logger.warnCalls).toEqual([]);
      },
    );
  });

  it('returns ordered review rows with answered/marked state', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-02-06T00:10:00Z'),
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: true,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-02-06T00:00:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'draft-choice-2',
          draftSavedAt: new Date('2026-02-06T00:05:00Z'),
          draftCumulativeMs: 20_000,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
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
          difficulty: 'hard',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        sessionId,
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 1,
        rows: [
          {
            isAvailable: true,
            questionId: 'q1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
            markedForReview: true,
          },
          {
            isAvailable: true,
            questionId: 'q2',
            slug: 'q-2',
            stemMd: 'Stem for q2',
            difficulty: 'hard',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      },
    );
  });

  it('counts draft answers for active exam sessions while keeping correctness hidden', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'draft-choice-1',
          draftSavedAt: new Date('2026-02-06T00:00:00Z'),
          draftCumulativeMs: 10_000,
        },
        {
          questionId: 'q2',
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'draft-choice-2',
          draftSavedAt: new Date('2026-02-06T00:02:00Z'),
          draftCumulativeMs: 20_000,
        },
        {
          questionId: 'q3',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
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
          difficulty: 'medium',
        }),
        createQuestion({
          id: 'q3',
          slug: 'q-3',
          stemMd: 'Stem for q3',
          difficulty: 'hard',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        sessionId,
        mode: 'exam',
        totalCount: 3,
        answeredCount: 2,
        markedCount: 1,
        rows: [
          {
            questionId: 'q1',
            isAnswered: true,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            isAnswered: true,
            isCorrect: null,
            isOmitted: false,
            markedForReview: true,
          },
          {
            questionId: 'q3',
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      },
    );
  });

  it('marks ended exam terminal-null question states as omitted incorrect rows', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-02-06T00:10:00Z'),
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-02-06T00:10:00Z'),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        answeredCount: 0,
        rows: [
          {
            questionId: 'q1',
            isAnswered: false,
            isCorrect: false,
            isOmitted: true,
          },
        ],
      },
    );
  });

  it('does not mark ended tutor terminal-null question states as omitted exam rows', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: new Date('2026-02-06T00:20:00Z'),
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-02-06T00:10:00Z'),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        answeredCount: 0,
        rows: [
          {
            questionId: 'q1',
            isAnswered: false,
            isCorrect: false,
            isOmitted: false,
          },
        ],
      },
    );
  });

  it('falls back to latestSelectedChoiceId for legacy active exam sessions with no draft', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'legacy-choice-1',
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
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
          difficulty: 'medium',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        answeredCount: 1,
        rows: [
          {
            questionId: 'q1',
            isAnswered: true,
            isCorrect: null,
          },
          {
            questionId: 'q2',
            isAnswered: false,
            isCorrect: null,
          },
        ],
      },
    );
  });

  it('redacts correctness for active exam sessions', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'choice-1',
          draftSavedAt: new Date('2026-02-06T00:00:00Z'),
          draftCumulativeMs: 10_000,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        rows: [
          {
            questionId: 'q1',
            isAnswered: true,
            isCorrect: null,
          },
        ],
      },
    );
  });

  it('shows correctness for active tutor sessions (no secrecy gate)', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: null,
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-02-06T00:00:00Z'),
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
        }),
      ]),
      new FakeLogger(),
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        rows: [
          {
            questionId: 'q1',
            isAnswered: true,
            isCorrect: false,
          },
        ],
      },
    );
  });

  it('throws INTERNAL_ERROR when normalized question state is missing', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const logger = new FakeLogger();
    const questions = new FakeQuestionRepository([
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
        difficulty: 'hard',
      }),
    ]);

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: true,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-06T00:00:00Z'),
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      new MismatchedStatePracticeSessionRepository(session),
      questions,
      logger,
    );

    await expect(useCase.execute({ userId, sessionId })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    // The review reads the questions the session's items bind (ADR-021).
    expect(questions.findByIdsForSessionCalls).toEqual([['q1']]);
    expect(logger.warnCalls).toEqual([]);
  });

  it('returns unavailable rows when a referenced question is missing and logs warning', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const orphanedQuestionId = 'q-orphaned';
    const logger = new FakeLogger();

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      questionIds: [orphanedQuestionId],
      questionStates: [
        {
          questionId: orphanedQuestionId,
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([]),
      logger,
    );

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        rows: [
          {
            isAvailable: false,
            questionId: orphanedQuestionId,
            markedForReview: true,
            isAnswered: false,
            isCorrect: null,
            order: 1,
          },
        ],
      },
    );

    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Practice session review references missing question',
      },
    ]);
  });

  it('returns NOT_FOUND when the session does not exist', async () => {
    const useCase = new GetPracticeSessionReviewUseCase(
      new FakePracticeSessionRepository([]),
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  // An exam item is omitted only when the ended exam finalized it without a
  // choice: no selection, graded incorrect, at the end time. Each case breaks
  // one of those conditions.
  it.each([
    ['an item of an exam still in progress', { endedAt: null }, {}],
    ['an item never graded', {}, { latestIsCorrect: null }],
    ['an item never finalized', {}, { latestAnsweredAt: null }],
  ] as const)(
    'does not mark %s omitted',
    async (_name, sessionOverrides, stateOverrides) => {
      const session = createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        endedAt: new Date('2026-02-06T00:10:00Z'),
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: false,
            latestAnsweredAt: new Date('2026-02-06T00:10:00Z'),
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
            ...stateOverrides,
          },
        ],
        ...sessionOverrides,
      });
      const useCase = new GetPracticeSessionReviewUseCase(
        new FakePracticeSessionRepository([session]),
        new FakeQuestionRepository([createQuestion({ id: 'q1' })]),
        new FakeLogger(),
      );

      const review = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(review.rows).toMatchObject([
        { questionId: 'q1', isOmitted: false },
      ]);
    },
  );
});
