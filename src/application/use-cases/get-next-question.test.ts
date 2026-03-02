import { describe, expect, it, vi } from 'vitest';
import {
  createQuestionSeed,
  createSeed,
  shuffleWithSeed,
} from '@/src/domain/services';
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
  now?: () => Date;
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
    overrides.now,
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

function getUtcDayStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function shuffleQuickPracticeCandidates(
  candidateIds: readonly string[],
  userId: string,
  now: Date,
): string[] {
  const seed = createSeed(userId, getUtcDayStartMs(now));
  return shuffleWithSeed(candidateIds, seed);
}

function createQuickPracticeQuestion(questionId: string, createdAtIso: string) {
  return createQuestion({
    id: questionId,
    slug: questionId,
    createdAt: new Date(createdAtIso),
    choices: [createChoice({ id: `choice-${questionId}`, questionId })],
  });
}

function findUserForShuffledFirst(
  candidateIds: readonly string[],
  now: Date,
): string {
  const originalFirst = candidateIds[0];
  const userId =
    Array.from({ length: 1_000 }, (_, i) => `shuffle-user-${i + 1}`).find(
      (candidate) =>
        shuffleQuickPracticeCandidates(candidateIds, candidate, now)[0] !==
        originalFirst,
    ) ?? null;

  if (!userId) {
    throw new Error(
      'Test setup failure: expected to find a userId whose daily shuffle changes the first candidate',
    );
  }

  return userId;
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

    const result = await getNextQuestion.execute({
      userId: USER_ID,
      sessionId: SESSION_ID,
      fromIndex: 1,
    });

    expect(result?.questionId).toBe('q2');
    expect(result?.session).toMatchObject({
      sessionId: SESSION_ID,
      mode: 'tutor',
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

  it('applies daily-seeded shuffle before selecting next question in filter mode', async () => {
    const now = new Date('2026-03-02T08:15:00.000Z');
    const candidateIds = ['q5', 'q4', 'q3', 'q2', 'q1'];
    const userId = findUserForShuffledFirst(candidateIds, now);

    const { getNextQuestion } = createTestDeps({
      now: () => now,
      questions: [
        createQuickPracticeQuestion('q1', '2026-01-01T00:00:00.000Z'),
        createQuickPracticeQuestion('q2', '2026-01-02T00:00:00.000Z'),
        createQuickPracticeQuestion('q3', '2026-01-03T00:00:00.000Z'),
        createQuickPracticeQuestion('q4', '2026-01-04T00:00:00.000Z'),
        createQuickPracticeQuestion('q5', '2026-01-05T00:00:00.000Z'),
      ],
    });

    const expectedOrder = shuffleQuickPracticeCandidates(
      candidateIds,
      userId,
      now,
    );
    const result = await getNextQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });

    expect(expectedOrder[0]).not.toBe(candidateIds[0]);
    expect(result?.questionId).toBe(expectedOrder[0]);
  });

  it('returns the same next question for the same user within the same UTC day', async () => {
    const nowMorning = new Date('2026-03-02T02:00:00.000Z');
    const nowEvening = new Date('2026-03-02T23:30:00.000Z');
    const candidateIds = ['q5', 'q4', 'q3', 'q2', 'q1'];
    const userId = findUserForShuffledFirst(candidateIds, nowMorning);

    const questions = [
      createQuickPracticeQuestion('q1', '2026-01-01T00:00:00.000Z'),
      createQuickPracticeQuestion('q2', '2026-01-02T00:00:00.000Z'),
      createQuickPracticeQuestion('q3', '2026-01-03T00:00:00.000Z'),
      createQuickPracticeQuestion('q4', '2026-01-04T00:00:00.000Z'),
      createQuickPracticeQuestion('q5', '2026-01-05T00:00:00.000Z'),
    ];

    const expectedMorning = shuffleQuickPracticeCandidates(
      candidateIds,
      userId,
      nowMorning,
    );
    const expectedEvening = shuffleQuickPracticeCandidates(
      candidateIds,
      userId,
      nowEvening,
    );

    const { getNextQuestion: getMorningQuestion } = createTestDeps({
      questions,
      now: () => nowMorning,
    });
    const { getNextQuestion: getEveningQuestion } = createTestDeps({
      questions,
      now: () => nowEvening,
    });

    const morningResult = await getMorningQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });
    const eveningResult = await getEveningQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });

    expect(expectedMorning).toEqual(expectedEvening);
    expect(morningResult?.questionId).toBe(expectedMorning[0]);
    expect(eveningResult?.questionId).toBe(expectedEvening[0]);
    expect(morningResult?.questionId).toBe(eveningResult?.questionId);
  });

  it('rotates quick-practice order across UTC day boundaries', async () => {
    const dayOne = new Date('2026-03-02T12:00:00.000Z');
    const candidateIds = ['q5', 'q4', 'q3', 'q2', 'q1'];
    const userId = findUserForShuffledFirst(candidateIds, dayOne);

    const dayOneOrder = shuffleQuickPracticeCandidates(
      candidateIds,
      userId,
      dayOne,
    );
    let dayTwo = new Date('2026-03-03T12:00:00.000Z');
    let dayTwoOrder = shuffleQuickPracticeCandidates(
      candidateIds,
      userId,
      dayTwo,
    );

    for (let i = 0; i < 14 && dayTwoOrder[0] === dayOneOrder[0]; i += 1) {
      dayTwo = new Date(dayOne.getTime() + (i + 1) * 86_400_000);
      dayTwoOrder = shuffleQuickPracticeCandidates(
        candidateIds,
        userId,
        dayTwo,
      );
    }

    if (dayOneOrder[0] === dayTwoOrder[0]) {
      throw new Error(
        'Test setup failure: expected different first candidates across UTC day boundaries',
      );
    }

    const questions = [
      createQuickPracticeQuestion('q1', '2026-01-01T00:00:00.000Z'),
      createQuickPracticeQuestion('q2', '2026-01-02T00:00:00.000Z'),
      createQuickPracticeQuestion('q3', '2026-01-03T00:00:00.000Z'),
      createQuickPracticeQuestion('q4', '2026-01-04T00:00:00.000Z'),
      createQuickPracticeQuestion('q5', '2026-01-05T00:00:00.000Z'),
    ];

    const { getNextQuestion: getDayOneQuestion } = createTestDeps({
      questions,
      now: () => dayOne,
    });
    const { getNextQuestion: getDayTwoQuestion } = createTestDeps({
      questions,
      now: () => dayTwo,
    });

    const dayOneResult = await getDayOneQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });
    const dayTwoResult = await getDayTwoQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });

    expect(dayOneResult?.questionId).toBe(dayOneOrder[0]);
    expect(dayTwoResult?.questionId).toBe(dayTwoOrder[0]);
    expect(dayOneResult?.questionId).not.toBe(dayTwoResult?.questionId);
  });

  it('keeps unique-oldest attempted fallback unchanged after candidate shuffling', async () => {
    const dayOne = new Date('2026-03-02T10:00:00.000Z');
    const dayTwo = new Date('2026-03-03T10:00:00.000Z');
    const questions = [
      createQuickPracticeQuestion('q1', '2026-01-01T00:00:00.000Z'),
      createQuickPracticeQuestion('q2', '2026-01-02T00:00:00.000Z'),
      createQuickPracticeQuestion('q3', '2026-01-03T00:00:00.000Z'),
    ];

    const attempts = [
      createAttempt({
        questionId: 'q1',
        selectedChoiceId: 'choice-q1',
        answeredAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      createAttempt({
        questionId: 'q2',
        selectedChoiceId: 'choice-q2',
        answeredAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
      createAttempt({
        questionId: 'q3',
        selectedChoiceId: 'choice-q3',
        answeredAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ];

    const { getNextQuestion: getDayOneQuestion } = createTestDeps({
      questions,
      attempts,
      now: () => dayOne,
    });
    const { getNextQuestion: getDayTwoQuestion } = createTestDeps({
      questions,
      attempts,
      now: () => dayTwo,
    });

    const dayOneResult = await getDayOneQuestion.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });
    const dayTwoResult = await getDayTwoQuestion.execute({
      userId: USER_ID,
      filters: EMPTY_FILTERS,
    });

    expect(dayOneResult?.questionId).toBe('q1');
    expect(dayTwoResult?.questionId).toBe('q1');
  });

  it('uses shuffled candidate order as deterministic tie-break when all attempts share a timestamp', async () => {
    const now = new Date('2026-03-02T08:15:00.000Z');
    const candidateIds = ['q4', 'q3', 'q2', 'q1'];
    const userId = findUserForShuffledFirst(candidateIds, now);
    const tieTimestamp = new Date('2026-02-20T12:00:00.000Z');

    const questions = [
      createQuickPracticeQuestion('q1', '2026-01-01T00:00:00.000Z'),
      createQuickPracticeQuestion('q2', '2026-01-02T00:00:00.000Z'),
      createQuickPracticeQuestion('q3', '2026-01-03T00:00:00.000Z'),
      createQuickPracticeQuestion('q4', '2026-01-04T00:00:00.000Z'),
    ];

    const attempts = [
      createAttempt({
        questionId: 'q1',
        selectedChoiceId: 'choice-q1',
        answeredAt: tieTimestamp,
      }),
      createAttempt({
        questionId: 'q2',
        selectedChoiceId: 'choice-q2',
        answeredAt: tieTimestamp,
      }),
      createAttempt({
        questionId: 'q3',
        selectedChoiceId: 'choice-q3',
        answeredAt: tieTimestamp,
      }),
      createAttempt({
        questionId: 'q4',
        selectedChoiceId: 'choice-q4',
        answeredAt: tieTimestamp,
      }),
    ];

    const expectedOrder = shuffleQuickPracticeCandidates(
      candidateIds,
      userId,
      now,
    );
    const { getNextQuestion } = createTestDeps({
      questions,
      attempts,
      now: () => now,
    });

    const firstResult = await getNextQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });
    const secondResult = await getNextQuestion.execute({
      userId,
      filters: EMPTY_FILTERS,
    });

    expect(expectedOrder[0]).not.toBe(candidateIds[0]);
    expect(firstResult?.questionId).toBe(expectedOrder[0]);
    expect(secondResult?.questionId).toBe(expectedOrder[0]);
  });

  it('applies the shuffled-candidate contract for unanswered, incorrect, and bookmarked pools', async () => {
    const now = new Date('2026-03-02T08:15:00.000Z');
    const candidatePools = {
      unanswered: ['u4', 'u3', 'u2', 'u1'],
      incorrect: ['i4', 'i3', 'i2', 'i1'],
      bookmarked: ['b4', 'b3', 'b2', 'b1'],
    } as const;

    const userId =
      Array.from({ length: 1_000 }, (_, i) => `status-user-${i + 1}`).find(
        (candidate) =>
          (
            Object.values(candidatePools) as readonly (readonly string[])[]
          ).every((ids) => {
            const shuffled = shuffleQuickPracticeCandidates(
              ids,
              candidate,
              now,
            );
            return shuffled[0] !== ids[0];
          }),
      ) ?? null;

    if (!userId) {
      throw new Error(
        'Test setup failure: expected to find a userId whose daily shuffle changes first candidates across all status pools',
      );
    }

    const questionRepo = new FakeQuestionRepository([
      ...candidatePools.unanswered.map((id, index) =>
        createQuickPracticeQuestion(id, `2026-01-${index + 1}T00:00:00.000Z`),
      ),
      ...candidatePools.incorrect.map((id, index) =>
        createQuickPracticeQuestion(id, `2026-02-${index + 1}T00:00:00.000Z`),
      ),
      ...candidatePools.bookmarked.map((id, index) =>
        createQuickPracticeQuestion(id, `2026-03-${index + 1}T00:00:00.000Z`),
      ),
    ]);
    const listCandidatesSpy = vi
      .spyOn(questionRepo, 'listPublishedCandidateIds')
      .mockImplementation(async (filters) => {
        const status = filters.statuses?.[0];
        if (!status) return [];
        return candidatePools[status] ?? [];
      });

    const getNextQuestion = new GetNextQuestionUseCase(
      questionRepo,
      new FakeAttemptRepository([]),
      new FakePracticeSessionRepository([]),
      () => now,
    );

    const unansweredResult = await getNextQuestion.execute({
      userId,
      filters: {
        ...EMPTY_FILTERS,
        statuses: ['unanswered'],
      },
    });
    const incorrectResult = await getNextQuestion.execute({
      userId,
      filters: {
        ...EMPTY_FILTERS,
        statuses: ['incorrect'],
      },
    });
    const bookmarkedResult = await getNextQuestion.execute({
      userId,
      filters: {
        ...EMPTY_FILTERS,
        statuses: ['bookmarked'],
      },
    });

    expect(unansweredResult?.questionId).toBe(
      shuffleQuickPracticeCandidates(candidatePools.unanswered, userId, now)[0],
    );
    expect(incorrectResult?.questionId).toBe(
      shuffleQuickPracticeCandidates(candidatePools.incorrect, userId, now)[0],
    );
    expect(bookmarkedResult?.questionId).toBe(
      shuffleQuickPracticeCandidates(candidatePools.bookmarked, userId, now)[0],
    );
    expect(listCandidatesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId,
        statuses: ['unanswered'],
      }),
    );
    expect(listCandidatesSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId,
        statuses: ['incorrect'],
      }),
    );
    expect(listCandidatesSpy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        userId,
        statuses: ['bookmarked'],
      }),
    );
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
      () => new Date('2026-03-02T00:00:00.000Z'),
    );

    await expect(
      getNextQuestion.execute({
        userId: USER_ID,
        filters: EMPTY_FILTERS,
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });
});
