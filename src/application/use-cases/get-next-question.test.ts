import { describe, expect, it, vi } from 'vitest';
import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
  createTag,
} from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import type { QuestionFilters } from '../ports/repositories';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetNextQuestionUseCase } from './get-next-question';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';
const ANSWERED_AT = new Date('2026-01-31T00:00:00Z');
const EMPTY_FILTERS: QuestionFilters = { tagSlugs: [], difficulties: [] };

type TestDepsOverrides = {
  questions?: ConstructorParameters<typeof FakeQuestionRepository>[0];
  attempts?: ConstructorParameters<typeof FakeAttemptRepository>[0];
  sessions?: ConstructorParameters<typeof FakePracticeSessionRepository>[0];
};

function createTestDeps(overrides: TestDepsOverrides = {}) {
  const questionRepo = new FakeQuestionRepository(overrides.questions ?? []);
  const attemptRepo = new FakeAttemptRepository(overrides.attempts ?? []);
  const sessionRepo = new FakePracticeSessionRepository(
    overrides.sessions ?? [],
  );
  const getNextQuestion = new GetNextQuestionUseCase(
    questionRepo,
    attemptRepo,
    sessionRepo,
  );

  return { questionRepo, attemptRepo, sessionRepo, getNextQuestion };
}

type QuestionState = ReturnType<
  typeof createPracticeSession
>['questionStates'][number];

function createQuestionState(
  questionId: string,
  overrides: Partial<QuestionState> = {},
): QuestionState {
  return {
    questionId,
    markedForReview: false,
    latestSelectedChoiceId: null,
    latestIsCorrect: null,
    latestAnsweredAt: null,
    ...overrides,
  };
}

function createSingleChoiceQuestion(questionId: string, choiceId: string) {
  return createQuestion({
    id: questionId,
    choices: [createChoice({ id: choiceId, questionId })],
  });
}

function createShuffleQuestion(questionId: string) {
  return createQuestion({
    id: questionId,
    choices: [
      createChoice({ id: 'c1', questionId, label: 'A', sortOrder: 1 }),
      createChoice({ id: 'c2', questionId, label: 'B', sortOrder: 2 }),
      createChoice({ id: 'c3', questionId, label: 'C', sortOrder: 3 }),
      createChoice({ id: 'c4', questionId, label: 'D', sortOrder: 4 }),
    ],
  });
}

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

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
    });

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toEqual({
      sessionId: SESSION_ID,
      mode: 'tutor',
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

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      fromIndex: 0,
    });

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'tutor',
      index: 1,
      total: 2,
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
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: ANSWERED_AT,
        }),
        createQuestionState('q2'),
        createQuestionState('q3'),
      ],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2, q3],
      sessions: [session],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      fromIndex: 2,
    });

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'exam',
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
          latestSelectedChoiceId: 'c1',
          latestIsCorrect: true,
          latestAnsweredAt: ANSWERED_AT,
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
    });

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'exam',
      index: 1,
      total: 2,
      isMarkedForReview: false,
    });
  });

  it('returns a specific session question when questionId is provided', async () => {
    const q1 = createSingleChoiceQuestion('q1', 'c1');
    const q2 = createSingleChoiceQuestion('q2', 'c2');

    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        createQuestionState('q1', {
          markedForReview: true,
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
        latestSelectedChoiceId: 'c1',
        latestIsCorrect: true,
        latestAnsweredAt: ANSWERED_AT,
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

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
    });

    expect(result?.questionId).toBe('q1');
    expect(result?.session).toEqual({
      sessionId: SESSION_ID,
      mode: 'tutor',
      index: 0,
      total: 3,
      isMarkedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
    });
  });

  it('throws NOT_FOUND when next session question is not published', async () => {
    const questionId = 'q1';

    const session = createPracticeSession({ questionIds: [questionId] });

    const { getNextQuestion } = createTestDeps({
      questions: [
        createQuestion({
          id: questionId,
          status: 'draft',
          choices: [createChoice({ id: 'c1', questionId })],
        }),
      ],
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

  it('returns null when no questions match filters', async () => {
    const { getNextQuestion } = createTestDeps();

    await expect(
      getNextQuestion.execute({ userId: USER_ID, filters: EMPTY_FILTERS }),
    ).resolves.toBeNull();
  });

  it('passes statuses + userId through to listPublishedCandidateIds', async () => {
    const { questionRepo, getNextQuestion } = createTestDeps({
      questions: [createSingleChoiceQuestion('q1', 'c1')],
    });

    await getNextQuestion.execute({
      userId: USER_ID,
      filters: {
        ...EMPTY_FILTERS,
        statuses: ['incorrect'] as const,
      },
    });

    expect(questionRepo.listPublishedCandidateIdsCalls[0]).toEqual({
      ...EMPTY_FILTERS,
      statuses: ['incorrect'],
      userId: USER_ID,
    });
  });

  it('returns null when status filters yield no candidates', async () => {
    const { getNextQuestion } = createTestDeps();

    await expect(
      getNextQuestion.execute({
        userId: USER_ID,
        filters: {
          ...EMPTY_FILTERS,
          statuses: ['unanswered'] as const,
        },
      }),
    ).resolves.toBeNull();
  });

  it('prefers never-attempted questions in filter mode', async () => {
    const tag = createTag({ slug: 'opioids', kind: 'topic' });

    const attempted = createQuestion({
      id: 'q-old',
      slug: 'q-old',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      choices: [createChoice({ id: 'c-old', questionId: 'q-old' })],
      tags: [tag],
    });

    const unattempted = createQuestion({
      id: 'q-new',
      slug: 'q-new',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      choices: [createChoice({ id: 'c-new', questionId: 'q-new' })],
      tags: [tag],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [attempted, unattempted],
      attempts: [
        createAttempt({
          questionId: 'q-old',
          selectedChoiceId: 'c-old',
          answeredAt: ANSWERED_AT,
        }),
      ],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      filters: { tagSlugs: ['opioids'], difficulties: [] },
    });

    expect(result?.questionId).toBe('q-new');
    expect(result?.session).toBeNull();
  });

  it('shuffles choices based on userId and questionId', async () => {
    const questionId = 'q1';
    const { getNextQuestion } = createTestDeps({
      questions: [createShuffleQuestion(questionId)],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    expect(result?.choices).toHaveLength(4);
    expect(new Set(result?.choices.map((c) => c.id))).toEqual(
      new Set(['c1', 'c2', 'c3', 'c4']),
    );
  });

  it('same user+question always gets same shuffle order', async () => {
    const questionId = 'q1';
    const { getNextQuestion } = createTestDeps({
      questions: [createShuffleQuestion(questionId)],
    });

    const result1 = await getNextQuestion.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    const result2 = await getNextQuestion.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    expect(result1?.choices.map((c) => c.id)).toEqual(
      result2?.choices.map((c) => c.id),
    );
  });

  it('assigns sequential labels (A-E) in presented order after shuffling', async () => {
    const questionId = 'q1';
    const question = createShuffleQuestion(questionId);

    const stableInput = question.choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });

    const originalOrder = stableInput.map((c) => c.id).join(',');

    const userId =
      Array.from({ length: 50 }, (_, i) => `user-${i + 1}`).find(
        (candidate) => {
          const seed = createQuestionSeed(candidate, questionId);
          const shuffledOrder = shuffleWithSeed(stableInput, seed)
            .map((c) => c.id)
            .join(',');
          return shuffledOrder !== originalOrder;
        },
      ) ?? null;

    if (!userId) {
      throw new Error(
        'Test setup failure: expected to find a userId that changes shuffle order',
      );
    }

    const { getNextQuestion } = createTestDeps({ questions: [question] });

    const result = await getNextQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });

    expect(result?.choices.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(result?.choices.map((c) => c.sortOrder)).toEqual([1, 2, 3, 4]);
  });

  it('produces the same shuffle order regardless of initial choice ordering', async () => {
    const questionId = 'q1';

    const choices = [
      createChoice({ id: 'c1', questionId, label: 'A', sortOrder: 1 }),
      createChoice({ id: 'c2', questionId, label: 'B', sortOrder: 1 }),
      createChoice({ id: 'c3', questionId, label: 'C', sortOrder: 1 }),
      createChoice({ id: 'c4', questionId, label: 'D', sortOrder: 1 }),
    ];

    const baseQuestion = createQuestion({ id: questionId, choices });

    const questionOrdered = baseQuestion;
    const questionUnordered = {
      ...baseQuestion,
      choices: [choices[2], choices[0], choices[3], choices[1]],
    };

    const { getNextQuestion: getNextQuestionOrdered } = createTestDeps({
      questions: [questionOrdered],
    });
    const { getNextQuestion: getNextQuestionUnordered } = createTestDeps({
      questions: [questionUnordered],
    });

    const result1 = await getNextQuestionOrdered.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    const result2 = await getNextQuestionUnordered.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    expect(result1?.choices.map((c) => c.id)).toEqual(
      result2?.choices.map((c) => c.id),
    );
  });

  it('chooses the question with the oldest last attempt if all attempted', async () => {
    const q1 = createQuestion({
      id: 'q1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      choices: [createChoice({ id: 'c1', questionId: 'q1' })],
    });

    const q2 = createQuestion({
      id: 'q2',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      choices: [createChoice({ id: 'c2', questionId: 'q2' })],
    });

    const { getNextQuestion } = createTestDeps({
      questions: [q1, q2],
      attempts: [
        createAttempt({
          questionId: 'q1',
          selectedChoiceId: 'c1',
          answeredAt: new Date('2026-01-30T00:00:00Z'),
        }),
        createAttempt({
          questionId: 'q2',
          selectedChoiceId: 'c2',
          answeredAt: ANSWERED_AT,
        }),
      ],
    });

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    expect(result?.questionId).toBe('q1');
  });

  it('throws VALIDATION_ERROR when input is missing both sessionId and filters', async () => {
    const { getNextQuestion } = createTestDeps();

    await expect(
      getNextQuestion.execute({ userId: USER_ID } as unknown as Parameters<
        typeof getNextQuestion.execute
      >[0]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when repository returns a candidate id that cannot be loaded', async () => {
    const questionRepo = new FakeQuestionRepository([]);
    vi.spyOn(questionRepo, 'listPublishedCandidateIds').mockResolvedValueOnce([
      'missing',
    ]);

    const getNextQuestion = new GetNextQuestionUseCase(
      questionRepo,
      new FakeAttemptRepository([]),
      new FakePracticeSessionRepository([]),
    );

    await expect(
      getNextQuestion.execute({
        userId: USER_ID,
        filters: EMPTY_FILTERS,
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });
});
