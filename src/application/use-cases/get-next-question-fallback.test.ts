import { describe, expect, it, vi } from 'vitest';
import {
  ANSWERED_AT,
  ApplicationError,
  createAttempt,
  createChoice,
  createFiveQuickPracticeQuestions,
  createQuestion,
  createQuestionSeed,
  createQuickPracticeQuestion,
  createShuffleQuestion,
  createSingleChoiceQuestion,
  createTag,
  createTestDeps,
  EMPTY_FILTERS,
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  findUserForRepositoryOrderVariance,
  findUserForShuffledFirst,
  GetNextQuestionUseCase,
  shuffleQuickPracticeCandidates,
  shuffleWithSeed,
  USER_ID,
} from './get-next-question-test-helpers';

describe('GetNextQuestionUseCase', () => {
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
      questions: createFiveQuickPracticeQuestions(),
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

    const questions = createFiveQuickPracticeQuestions();

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

    const questions = createFiveQuickPracticeQuestions();

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
    const questions = createFiveQuickPracticeQuestions().slice(0, 3);

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

    const questions = createFiveQuickPracticeQuestions().slice(0, 4);

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
        createQuickPracticeQuestion(
          id,
          `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
      ),
      ...candidatePools.incorrect.map((id, index) =>
        createQuickPracticeQuestion(
          id,
          `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
      ),
      ...candidatePools.bookmarked.map((id, index) =>
        createQuickPracticeQuestion(
          id,
          `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
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

  it('returns the same next question for equivalent candidate sets regardless of repository ordering', async () => {
    const now = new Date('2026-03-02T08:15:00.000Z');
    const repositoryOrderA = ['q5', 'q4', 'q3', 'q2', 'q1'];
    const repositoryOrderB = ['q2', 'q3', 'q4', 'q5', 'q1'];
    const userId = findUserForRepositoryOrderVariance(
      repositoryOrderA,
      repositoryOrderB,
      now,
    );

    const questions = createFiveQuickPracticeQuestions();

    const firstQuestionRepo = new FakeQuestionRepository(questions);
    const secondQuestionRepo = new FakeQuestionRepository(questions);
    const firstListCandidatesSpy = vi
      .spyOn(firstQuestionRepo, 'listPublishedCandidateIds')
      .mockResolvedValue(repositoryOrderA);
    const secondListCandidatesSpy = vi
      .spyOn(secondQuestionRepo, 'listPublishedCandidateIds')
      .mockResolvedValue(repositoryOrderB);

    const firstUseCase = new GetNextQuestionUseCase(
      firstQuestionRepo,
      new FakeAttemptRepository([]),
      new FakePracticeSessionRepository([]),
      () => now,
    );
    const secondUseCase = new GetNextQuestionUseCase(
      secondQuestionRepo,
      new FakeAttemptRepository([]),
      new FakePracticeSessionRepository([]),
      () => now,
    );

    const firstResult = await firstUseCase.execute({
      userId,
      filters: EMPTY_FILTERS,
    });
    const secondResult = await secondUseCase.execute({
      userId,
      filters: EMPTY_FILTERS,
    });

    expect(firstResult?.questionId).toBe(secondResult?.questionId);
    expect(firstListCandidatesSpy).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      userId,
    });
    expect(secondListCandidatesSpy).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      userId,
    });
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

    const createSortableChoice = (id: string, label: 'A' | 'B' | 'C' | 'D') =>
      createChoice({
        id,
        questionId,
        label,
        sortOrder: 1,
      });

    const choices = [
      createSortableChoice('c1', 'A'),
      createSortableChoice('c2', 'B'),
      createSortableChoice('c3', 'C'),
      createSortableChoice('c4', 'D'),
    ];

    const baseQuestion = createQuestion({ id: questionId, choices });

    const questionOrdered = baseQuestion;
    const questionUnordered = {
      ...baseQuestion,
      choices: [
        createSortableChoice('c3', 'C'),
        createSortableChoice('c1', 'A'),
        createSortableChoice('c4', 'D'),
        createSortableChoice('c2', 'B'),
      ],
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
