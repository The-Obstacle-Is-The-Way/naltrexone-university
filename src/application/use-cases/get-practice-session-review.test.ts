import { describe, expect, it } from 'vitest';
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

  async findByIdAndUserId(
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

  it('builds rows from questionIds even when questionStates is shorter', async () => {
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

    await expect(useCase.execute({ userId, sessionId })).resolves.toMatchObject(
      {
        totalCount: 2,
        answeredCount: 1,
        markedCount: 1,
        rows: [
          {
            isAvailable: true,
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
            isOmitted: false,
            markedForReview: true,
          },
          {
            isAvailable: true,
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            isOmitted: false,
            markedForReview: false,
          },
        ],
      },
    );
    expect(questions.findPublishedByIdsCalls).toEqual([['q1', 'q2']]);
    expect(logger.warnCalls).toEqual([
      {
        context: {
          sessionId,
          userId,
          questionId: 'q2',
        },
        msg: 'Practice session review missing question state; defaulting to unanswered',
      },
    ]);
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
});
