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
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            markedForReview: true,
          },
          {
            isAvailable: true,
            questionId: 'q2',
            stemMd: 'Stem for q2',
            difficulty: 'hard',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
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
      mode: 'exam',
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
            order: 1,
            isAnswered: true,
            isCorrect: true,
            markedForReview: true,
          },
          {
            isAvailable: true,
            questionId: 'q2',
            order: 2,
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      },
    );
    expect(questions.findPublishedByIdsCalls).toEqual([['q1', 'q2']]);
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
});
