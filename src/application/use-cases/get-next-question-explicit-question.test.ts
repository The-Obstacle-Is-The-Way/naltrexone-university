import { describe, expect, it } from 'vitest';
import { PracticeSessionConflictReasons } from '@/src/application/errors';
import {
  ANSWERED_AT,
  createChoice,
  createPracticeSession,
  createQuestion,
  createQuestionState,
  createSingleChoiceQuestion,
  createTestDeps,
  SESSION_ID,
  USER_ID,
} from './get-next-question-test-helpers';

describe('GetNextQuestionUseCase', () => {
  it('returns a specific session question when questionId is provided', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        createQuestionState('q1', {
          markedForReview: true,
          draftSelectedChoiceId: 'c1',
          draftSavedAt: ANSWERED_AT,
          draftCumulativeMs: 25_000,
        }),
        createQuestionState('q2'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      sessions: [session],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionId: 'q1',
    });

    expect(result?.questionId).toBe('q1');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'exam',
      index: 0,
      total: 2,
      isMarkedForReview: true,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      draftSelectedChoiceId: 'c1',
      draftCumulativeMs: 25_000,
    });
  });

  it('treats legacy latestSelectedChoiceId as a draft fallback for active exam sessions', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        createQuestionState('q1', {
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: ANSWERED_AT,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 25_000,
        }),
        createQuestionState('q2'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      sessions: [session],
    });

    const nextResult = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
    });

    expect(nextResult?.questionId).toBe('q2');

    const revisitResult = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionId: 'q1',
    });

    expect(revisitResult?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'exam',
      index: 0,
      total: 2,
      latestSelectedChoiceId: 'c1',
      latestIsCorrect: null,
      draftSelectedChoiceId: 'c1',
      draftCumulativeMs: 25_000,
    });
  });

  it('includes previousSubmission when question was answered in tutor mode', async () => {
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          isCorrect: false,
          explanationMd: 'Choice 1 explainer',
        }),
        createChoice({
          id: 'c2',
          questionId,
          label: 'B',
          isCorrect: true,
          explanationMd: 'Choice 2 explainer',
        }),
        createChoice({
          id: 'c3',
          questionId,
          label: 'C',
          isCorrect: false,
          explanationMd: null,
        }),
      ],
    });

    const session = createPracticeSession({
      questionIds: [questionId],
      questionStates: [
        createQuestionState(questionId, {
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: false,
          latestAnsweredAt: ANSWERED_AT,
        }),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [question],
      sessions: [session],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionId,
    });

    const previousSubmission = result?.session?.previousSubmission;
    if (!previousSubmission) {
      throw new Error('Expected previousSubmission to be present');
    }

    expect(previousSubmission.correctChoiceId).toBe('c2');
    expect(previousSubmission.explanationMd).toBe('Explanation');
    expect(previousSubmission.referenceMd).toBe(
      'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    );
    expect(previousSubmission.choiceExplanations).toHaveLength(
      result?.choices.length ?? 0,
    );
    expect(
      previousSubmission.choiceExplanations.map((choice) => choice.choiceId),
    ).toEqual(result?.choices.map((choice) => choice.id) ?? []);
    expect(
      previousSubmission.choiceExplanations.map(
        (choice) => choice.displayLabel,
      ),
    ).toEqual(result?.choices.map((choice) => choice.label) ?? []);
  });

  it.each([
    {
      name: 'does not include previousSubmission when question is unanswered',
      mode: 'tutor' as const,
      questionState: createQuestionState('q1'),
    },
    {
      name: 'does not include previousSubmission in exam mode even when answered',
      mode: 'exam' as const,
      questionState: createQuestionState('q1', {
        draftSelectedChoiceId: 'c1',
        draftSavedAt: ANSWERED_AT,
        draftCumulativeMs: 10_000,
      }),
    },
  ])('$name', async ({ mode, questionState }) => {
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      choices: [createChoice({ id: 'c1', questionId, isCorrect: true })],
    });

    const session = createPracticeSession({
      mode,
      questionIds: [questionId],
      questionStates: [questionState],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [question],
      sessions: [session],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionId,
    });

    expect(result?.session?.previousSubmission).toBeUndefined();
  });

  it('returns latestIsCorrect in tutor mode when answered', async () => {
    const q1 = createQuestion({
      id: 'q1',
      choices: [
        createChoice({ id: 'c1', questionId: 'q1', isCorrect: true }),
        createChoice({ id: 'c2', questionId: 'q1', isCorrect: false }),
      ],
    });

    const session = createPracticeSession({
      mode: 'tutor',
      questionIds: ['q1'],
      questionStates: [
        createQuestionState('q1', {
          latestSelectedChoiceId: 'c2',
          latestIsCorrect: false,
          latestAnsweredAt: ANSWERED_AT,
        }),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionId: 'q1',
    });

    expect(result?.session?.latestIsCorrect).toBe(false);
  });

  it('redacts latestIsCorrect to null during active exam', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');

    const session = createPracticeSession({
      mode: 'exam',
      endedAt: null,
      questionIds: ['q1'],
      questionStates: [
        createQuestionState('q1', {
          draftSelectedChoiceId: 'c1',
          draftSavedAt: ANSWERED_AT,
          draftCumulativeMs: 30_000,
        }),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionId: 'q1',
    });

    expect(result?.session?.latestIsCorrect).toBeNull();
  });

  it('throws CONFLICT when requesting a specific question after exam ends', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');

    const session = createPracticeSession({
      mode: 'exam',
      endedAt: new Date('2026-01-31T01:00:00Z'),
      questionIds: ['q1'],
      questionStates: [
        createQuestionState('q1', {
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: ANSWERED_AT,
        }),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
    });

    await expect(
      getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
        questionId: 'q1',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
      details: { reason: PracticeSessionConflictReasons.AlreadyEnded },
    });
  });
});
