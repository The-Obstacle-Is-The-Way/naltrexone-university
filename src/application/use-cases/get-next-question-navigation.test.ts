import { describe, expect, it } from 'vitest';
import { PracticeSessionConflictReasons } from '@/src/application/errors';
import {
  ANSWERED_AT,
  ApplicationError,
  answerableQuestion,
  createChoice,
  createPracticeSession,
  createQuestion,
  createQuestionState,
  createSingleChoiceQuestion,
  createTestDeps,
  SESSION_ID,
  USER_ID,
} from '../test-helpers/get-next-question-test-helpers';

describe('GetNextQuestionUseCase', () => {
  it('returns next unanswered question for a session', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      questionIds: ['q1', 'q2'],
      questionStates: [
        createQuestionState('q1', {
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: false,
          latestAnsweredAt: ANSWERED_AT,
        }),
        createQuestionState('q2'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      sessions: [session],
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    );

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toEqual({
      sessionId: SESSION_ID,
      mode: 'tutor',

      deadlineAt: null,

      index: 1,
      total: 2,
      isMarkedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
    });
    expect(result?.choices[0]).not.toHaveProperty('isCorrect');
  });

  it('returns next unanswered question after fromIndex when provided', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      questionIds: ['q1', 'q2'],
      questionStates: [createQuestionState('q1'), createQuestionState('q2')],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      sessions: [session],
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
        fromIndex: 0,
      }),
    );

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'tutor',

      deadlineAt: null,

      index: 1,
      total: 2,
    });
  });

  it('throws CONFLICT when loading a question for an ended session', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const session = createPracticeSession({
      id: SESSION_ID,
      userId: USER_ID,
      questionIds: ['q1'],
      questionStates: [createQuestionState('q1')],
      endedAt: new Date('2026-02-01T00:05:00Z'),
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
    });

    await expect(
      getNextQuestion.execute({ userId: USER_ID, sessionId: SESSION_ID }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
      details: { reason: PracticeSessionConflictReasons.AlreadyEnded },
    });
  });

  it('throws INTERNAL_ERROR when normalized question state is missing', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');
    const session = createPracticeSession({
      questionIds: ['q1', 'q2'],
      questionStates: [createQuestionState('q1')],
    });

    const { getNextQuestion, sessionRepo } = createTestDeps({
      questions: [q1, q2],
    });
    sessionRepo.findByIdAndUserId = async () => session;

    await expect(
      getNextQuestion.execute({ userId: USER_ID, sessionId: SESSION_ID }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('wraps to earlier unanswered questions when no unanswered remain after fromIndex', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');
    const q3 = createSingleChoiceQuestion('q3', 'c3');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        createQuestionState('q1', {
          draftSelectedChoiceId: 'c1',
          draftSavedAt: ANSWERED_AT,
          draftCumulativeMs: 10_000,
        }),
        createQuestionState('q2'),
        createQuestionState('q3'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2, q3],
      sessions: [session],
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
        fromIndex: 2,
      }),
    );

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'exam',
      index: 1,
      total: 3,
    });
  });

  it('returns the current question when fromIndex points at the only unanswered state', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');
    const q3 = createSingleChoiceQuestion('q3', 'c3');

    const session = createPracticeSession({
      mode: 'tutor',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        createQuestionState('q1', {
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: ANSWERED_AT,
        }),
        createQuestionState('q2'),
        createQuestionState('q3', {
          latestSelectedChoiceId: 'c3',
          latestIsCorrect: false,
          latestAnsweredAt: ANSWERED_AT,
        }),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2, q3],
      sessions: [session],
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
        fromIndex: 1,
      }),
    );

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'tutor',

      deadlineAt: null,

      index: 1,
      total: 3,
    });
  });

  it('uses persisted session question state (not attempts) to choose next question', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        createQuestionState('q1', {
          draftSelectedChoiceId: 'c1',
          draftSavedAt: ANSWERED_AT,
          draftCumulativeMs: 10_000,
        }),
        createQuestionState('q2'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      sessions: [session],
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    );

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'exam',
      index: 1,
      total: 2,
      isMarkedForReview: false,
    });
  });

  it('returns session index using question order position', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');
    const q3 = createSingleChoiceQuestion('q3', 'c3');

    const session = createPracticeSession({
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        createQuestionState('q1'),
        createQuestionState('q2', {
          latestSelectedChoiceId: 'c2',
          latestIsCorrect: false,
          latestAnsweredAt: ANSWERED_AT,
        }),
        createQuestionState('q3'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2, q3],
      sessions: [session],
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    );

    expect(result?.questionId).toBe('q1');
    expect(result?.session).toEqual({
      sessionId: SESSION_ID,
      mode: 'tutor',

      deadlineAt: null,

      index: 0,
      total: 3,
      isMarkedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
    });
  });

  it('includes the server-derived exam deadline on active exam session payloads', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [createQuestionState('q1'), createQuestionState('q2')],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      sessions: [session],
      now: () => new Date('2026-05-22T12:00:30.000Z'),
    });

    const result = answerableQuestion(
      await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    );

    expect(result?.session).toMatchObject({
      mode: 'exam',
      deadlineAt: '2026-05-22T12:02:24.000Z',
    });
  });

  it('finalizes an expired active exam instead of serving another question', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const finalizerInputs: Array<{ userId: string; sessionId: string }> = [];

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [createQuestionState('q1')],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
      now: () => new Date('2026-05-22T12:01:12.000Z'),
      expiredExamFinalizer: {
        execute: async (input) => {
          finalizerInputs.push(input);
        },
      },
    });

    await expect(
      getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toBeNull();
    expect(finalizerInputs).toEqual([
      { userId: USER_ID, sessionId: SESSION_ID },
    ]);
  });

  it('throws INTERNAL_ERROR when an expired active exam has no finalizer configured', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [createQuestionState('q1')],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
      now: () => new Date('2026-05-22T12:01:12.000Z'),
    });

    await expect(
      getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Expired exam finalizer is not configured',
      ),
    );
  });

  // ADR-021 §3, ADR-022 Decision 5 and Pattern Registry F-11: a question
  // that became unavailable after the session began is returned as
  // unavailable, with its state, its place in the session and none of its
  // content, so the page can say so and move on.
  describe('an item whose question became unavailable since the session began', () => {
    function unavailableItemDeps(
      overlay?: NonNullable<
        Parameters<typeof createTestDeps>[0]
      >['questionOverlay'],
    ) {
      const unavailable = createQuestion({
        id: 'q2',
        status: 'archived',
        choices: [createChoice({ id: 'c2', questionId: 'q2' })],
      });
      const session = createPracticeSession({
        questionIds: ['q1', 'q2'],
        questionStates: [
          createQuestionState('q1', {
            latestSelectedChoiceId: 'c1',
            latestIsCorrect: true,
            latestAnsweredAt: ANSWERED_AT,
          }),
          createQuestionState('q2', { markedForReview: true }),
        ],
      });
      return createTestDeps({
        questions: [createSingleChoiceQuestion('q1', 'c1'), unavailable],
        questionOverlay: overlay,
        sessions: [session],
      });
    }
    // Unanswered, so it would not count if the session ended now.
    const unavailableItem = (availability: string) => ({
      unavailable: true,
      availability,
      countsIfEndedNow: false,
      questionId: 'q2',
      session: {
        sessionId: SESSION_ID,
        mode: 'tutor',
        index: 1,
        total: 2,
        deadlineAt: null,
        isMarkedForReview: true,
      },
    });
    const revisionId = createQuestion({ id: 'q2' }).revisionId;

    it.each([
      [
        'withdrawn',
        { withdrawals: [{ questionId: 'q2', questionRevisionId: revisionId }] },
      ],
      [
        'under_review',
        {
          holds: [
            { questionId: 'q2', questionRevisionId: revisionId, lifted: false },
          ],
        },
      ],
      ['retired', undefined],
    ] as const)(
      'is returned %s, without its content, when the next unanswered item',
      async (availability, overlay) => {
        const { getNextQuestion } = unavailableItemDeps(overlay);

        await expect(
          getNextQuestion.execute({ userId: USER_ID, sessionId: SESSION_ID }),
        ).resolves.toEqual(unavailableItem(availability));
      },
    );

    // ADR-022 Amendment: a tutor answer given before the question was retired
    // keeps its fair chance, so the item still counts.
    it('says a tutor answer already given on a retired question still counts', async () => {
      const retired = createQuestion({
        id: 'q2',
        status: 'archived',
        choices: [createChoice({ id: 'c2', questionId: 'q2' })],
      });
      const { getNextQuestion } = createTestDeps({
        questions: [createSingleChoiceQuestion('q1', 'c1'), retired],
        sessions: [
          createPracticeSession({
            questionIds: ['q1', 'q2'],
            questionStates: [
              createQuestionState('q1'),
              createQuestionState('q2', {
                latestSelectedChoiceId: 'c2',
                latestIsCorrect: true,
                latestAnsweredAt: ANSWERED_AT,
              }),
            ],
          }),
        ],
      });

      await expect(
        getNextQuestion.execute({
          userId: USER_ID,
          sessionId: SESSION_ID,
          questionId: 'q2',
        }),
      ).resolves.toMatchObject({
        unavailable: true,
        availability: 'retired',
        countsIfEndedNow: true,
      });
    });

    // DEBT-498: the answer is graded against the key it was given, so once
    // that key is corrected the item counts toward no score.
    it('says a tutor answer on a retired question whose key was corrected since will not count', async () => {
      const keyed = (correctId: 'c2' | 'c3', revisionId?: string) =>
        createQuestion({
          id: 'q2',
          status: 'archived',
          ...(revisionId ? { revisionId } : {}),
          choices: (['c2', 'c3'] as const).map((id, index) =>
            createChoice({
              id,
              questionId: 'q2',
              label: index === 0 ? 'A' : 'B',
              textMd: `Choice ${id}`,
              isCorrect: id === correctId,
              sortOrder: index + 1,
            }),
          ),
        });
      const current = keyed('c3');
      const answered = keyed('c2', crypto.randomUUID());
      const { getNextQuestion } = createTestDeps({
        questions: [createSingleChoiceQuestion('q1', 'c1'), current, answered],
        sessions: [
          createPracticeSession({
            questionIds: ['q1', 'q2'],
            questionStates: [
              createQuestionState('q1'),
              createQuestionState('q2', {
                questionRevisionId: answered.revisionId,
                latestSelectedChoiceId: 'c2',
                latestIsCorrect: true,
                latestAnsweredAt: ANSWERED_AT,
              }),
            ],
          }),
        ],
      });

      await expect(
        getNextQuestion.execute({
          userId: USER_ID,
          sessionId: SESSION_ID,
          questionId: 'q2',
        }),
      ).resolves.toMatchObject({
        unavailable: true,
        availability: 'retired',
        countsIfEndedNow: false,
      });
    });

    it('is refused by the answerable-question narrowing in tests', async () => {
      const { getNextQuestion } = unavailableItemDeps();
      const output = await getNextQuestion.execute({
        userId: USER_ID,
        sessionId: SESSION_ID,
      });

      expect(() => answerableQuestion(output)).toThrow(
        'Expected an answerable question, got an unavailable item',
      );
    });

    it('is returned without its content when requested by id', async () => {
      const { getNextQuestion } = unavailableItemDeps();

      await expect(
        getNextQuestion.execute({
          userId: USER_ID,
          sessionId: SESSION_ID,
          questionId: 'q2',
        }),
      ).resolves.toEqual(unavailableItem('retired'));
    });
  });

  it('throws NOT_FOUND when a session question no longer exists', async () => {
    const session = createPracticeSession({ questionIds: ['q-missing'] });
    const { getNextQuestion } = createTestDeps({
      questions: [],
      sessions: [session],
    });

    await expect(
      getNextQuestion.execute({ userId: USER_ID, sessionId: SESSION_ID }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });

  it('returns null when session is complete', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');

    const session = createPracticeSession({
      questionIds: ['q1'],
      questionStates: [
        createQuestionState('q1', {
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: false,
          latestAnsweredAt: ANSWERED_AT,
        }),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1],
      sessions: [session],
    });

    await expect(
      getNextQuestion.execute({ userId: USER_ID, sessionId: SESSION_ID }),
    ).resolves.toBeNull();
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    const { getNextQuestion } = createTestDeps();

    await expect(
      getNextQuestion.execute({ userId: USER_ID, sessionId: 'missing' }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });
});
