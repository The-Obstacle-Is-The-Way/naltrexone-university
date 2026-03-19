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
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from './get-completed-session-questions-with-feedback';

describe('GetCompletedSessionQuestionsWithFeedbackUseCase', () => {
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
    if (!output.rows[0] || !output.rows[0].isAvailable) {
      throw new Error('Expected first row to be available');
    }
    expect(output.rows[0].choices).toHaveLength(2);
    expect(output.rows[0].choices.map((choice) => choice.id)).toEqual(
      expect.arrayContaining(['q1-choice-a', 'q1-choice-b']),
    );
    expect(output.rows[0].choiceExplanations).toHaveLength(2);
    expect(
      output.rows[0].choiceExplanations.map((choice) => choice.choiceId),
    ).toEqual(expect.arrayContaining(['q1-choice-a', 'q1-choice-b']));

    expect(output.rows[1]).toMatchObject({
      isAvailable: true,
      questionId: 'q2',
      slug: 'q-2',
      order: 2,
      isAnswered: false,
      isCorrect: null,
      markedForReview: true,
      selectedChoiceId: null,
      correctChoiceId: 'q2-choice-a',
      explanationMd: 'Overall explanation for q2',
      referenceMd: 'Reference for q2',
    });
  });

  it('throws CONFLICT when the session is still in progress', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: ['q1'],
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
      ]),
      new FakeAttemptRepository([]),
      new FakeLogger(),
    );

    const error = await useCase
      .execute({ userId, sessionId })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: 'CONFLICT',
    });
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

    const useCase = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      new FakePracticeSessionRepository([session]),
      new FakeQuestionRepository([availableQuestion]),
      new FakeAttemptRepository([]),
      new FakeLogger(),
    );

    const output = await useCase.execute({ userId, sessionId });

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
      markedForReview: true,
    });
  });
});
