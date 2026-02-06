// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetPracticeSessionReviewUseCase } from './get-practice-session-review';

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
