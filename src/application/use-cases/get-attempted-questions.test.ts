import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createChoice,
  createQuestion,
  createTag,
} from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import { GetAttemptedQuestionsUseCase } from './get-attempted-questions';

describe('GetAttemptedQuestionsUseCase', () => {
  it('shows and filters a question by the revision its latest attempt answered (ADR-021)', async () => {
    const current = createQuestion({
      id: 'q1',
      stemMd: 'Current stem',
      difficulty: 'hard',
    });
    const answered = createQuestion({
      id: 'q1',
      revisionId: crypto.randomUUID(),
      stemMd: 'Answered stem',
      difficulty: 'easy',
    });
    const questions = [current, answered];
    const attempt = createAttempt({
      userId: 'user-1',
      questionId: 'q1',
      questionRevisionId: answered.revisionId,
    });
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([attempt], { questions }),
      new FakeQuestionRepository(questions),
      new FakeLogger(),
    );
    const page = { userId: 'user-1', limit: 10, offset: 0 };

    const easy = await useCase.execute({ ...page, difficulty: 'easy' });
    const hard = await useCase.execute({ ...page, difficulty: 'hard' });

    expect(easy.rows).toEqual([
      expect.objectContaining({ stemMd: 'Answered stem', difficulty: 'easy' }),
    ]);
    expect(hard.rows).toEqual([]);
  });

  // DEBT-498: History shows a result no score counts as "Not scored", so each
  // answered row says whether its key was corrected since.
  it('marks a latest answer graded on a key corrected since, and no other', async () => {
    const keyed = (
      questionId: string,
      correctLabel: 'A' | 'B',
      revisionId?: string,
    ) =>
      createQuestion({
        id: questionId,
        slug: questionId,
        ...(revisionId ? { revisionId } : {}),
        choices: (['A', 'B'] as const).map((label, index) =>
          createChoice({
            questionId,
            label,
            textMd: `Choice ${label}`,
            isCorrect: label === correctLabel,
            sortOrder: index + 1,
          }),
        ),
      });
    const revisionsOf = (questionId: string) => ({
      current: keyed(questionId, 'A'),
      older: keyed(questionId, 'B', crypto.randomUUID()),
    });
    const answeredOnOlder = revisionsOf('q1');
    const omittedOnOlder = revisionsOf('q2');
    const answeredOnCurrent = revisionsOf('q3');
    const questions = [
      answeredOnOlder,
      omittedOnOlder,
      answeredOnCurrent,
    ].flatMap(({ current, older }) => [current, older]);
    const attempts = [
      createAttempt({
        userId: 'user-1',
        questionId: 'q1',
        questionRevisionId: answeredOnOlder.older.revisionId,
        answeredAt: new Date('2026-02-01T11:00:00Z'),
      }),
      createAttempt({
        userId: 'user-1',
        questionId: 'q2',
        questionRevisionId: omittedOnOlder.older.revisionId,
        outcome: omittedOutcome(),
        answeredAt: new Date('2026-02-01T10:00:00Z'),
      }),
      createAttempt({
        userId: 'user-1',
        questionId: 'q3',
        questionRevisionId: answeredOnCurrent.current.revisionId,
        answeredAt: new Date('2026-02-01T09:00:00Z'),
      }),
    ];
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(attempts, { questions }),
      new FakeQuestionRepository(questions),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-1',
      limit: 10,
      offset: 0,
    });

    expect(
      result.rows.map((row) => (row.isAvailable ? row.answerKeyChanged : null)),
    ).toEqual([true, false, false]);
  });

  // ADR-022 Decision 2: an omitted attempt is not an answer, so the row for
  // a question no longer published shows nothing of it.
  it('lists an omitted attempt on a question withdrawn since as unavailable', async () => {
    const withdrawn = createQuestion({
      id: 'q1',
      status: 'archived',
      stemMd: 'Possibly unsafe stem',
    });
    const questions = [withdrawn];
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({
            userId: 'user-1',
            questionId: 'q1',
            outcome: omittedOutcome(),
            isCorrect: false,
          }),
        ],
        { questions },
      ),
      new FakeQuestionRepository(questions),
      new FakeLogger(),
    );

    const { rows } = await useCase.execute({
      userId: 'user-1',
      limit: 10,
      offset: 0,
    });

    expect(rows).toEqual([
      expect.objectContaining({ isAvailable: false, questionId: 'q1' }),
    ]);
    expect(rows[0]).not.toHaveProperty('stemMd');
  });

  it('lists an omitted attempt on a question still published as available', async () => {
    const live = createQuestion({ id: 'q1', stemMd: 'Live stem' });
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({
            userId: 'user-1',
            questionId: 'q1',
            outcome: omittedOutcome(),
            isCorrect: false,
          }),
        ],
        { questions: [live] },
      ),
      new FakeQuestionRepository([live]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        { isAvailable: true, stemMd: 'Live stem', availability: 'available' },
      ],
    });
  });

  // ADR-021 §3: the learner attempted it, so it stays listed and reviewable.
  it('lists a question withdrawn since the attempt as available, marked withdrawn', async () => {
    const withdrawn = createQuestion({
      id: 'q1',
      slug: 'withdrawn-question',
      status: 'archived',
      stemMd: 'Answered stem',
    });
    const published = createQuestion({ id: 'q2', slug: 'published-question' });
    const questions = [withdrawn, published];
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({ userId: 'user-1', questionId: 'q1' }),
          createAttempt({ userId: 'user-1', questionId: 'q2' }),
        ],
        { questions },
      ),
      new FakeQuestionRepository(questions, {
        withdrawals: [
          {
            questionId: withdrawn.id,
            questionRevisionId: withdrawn.revisionId,
          },
        ],
      }),
      new FakeLogger(),
    );

    const { rows } = await useCase.execute({
      userId: 'user-1',
      limit: 10,
      offset: 0,
    });

    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(
      expect.objectContaining({
        isAvailable: true,
        questionId: 'q1',
        slug: 'withdrawn-question',
        stemMd: 'Answered stem',
        availability: 'withdrawn',
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ questionId: 'q2', availability: 'available' }),
    );
  });

  it('returns empty rows when user has no attempts', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([]),
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [],
      limit: 10,
      offset: 0,
      totalCount: 0,
    });
  });

  it('returns all attempted questions (correct and incorrect) joined to published questions', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q2',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          userId: 'user-1',
          questionId: 'q3',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T09:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
        createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem for q2' }),
        createQuestion({ id: 'q3', slug: 'q-3', stemMd: 'Stem for q3' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          isAvailable: true,
          availability: 'available',
          questionId: 'q1',
          isCorrect: false,
          answerKeyChanged: false,
          sessionId: null,
          sessionMode: null,
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'easy',
          tagSlugs: [],
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
        {
          isAvailable: true,
          availability: 'available',
          questionId: 'q2',
          isCorrect: true,
          answerKeyChanged: false,
          sessionId: null,
          sessionMode: null,
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'easy',
          tagSlugs: [],
          lastAnsweredAt: '2026-02-01T10:00:00.000Z',
        },
        {
          isAvailable: true,
          availability: 'available',
          questionId: 'q3',
          isCorrect: true,
          answerKeyChanged: false,
          sessionId: null,
          sessionMode: null,
          slug: 'q-3',
          stemMd: 'Stem for q3',
          difficulty: 'easy',
          tagSlugs: [],
          lastAnsweredAt: '2026-02-01T09:00:00.000Z',
        },
      ],
      limit: 10,
      offset: 0,
      totalCount: 3,
    });
  });

  it('returns only the most recent attempt per question when multiple attempts exist', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T10:00:00Z'),
        }),
        createAttempt({
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        {
          questionId: 'q1',
          isCorrect: true,
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
      ],
      totalCount: 1,
    });
  });

  it('orders globally by incorrect-first before pagination', async () => {
    const questions = [
      createQuestion({
        id: 'q-correct-recent',
        slug: 'q-correct-recent',
        stemMd: 'Correct recent',
      }),
      createQuestion({
        id: 'q-incorrect-recent',
        slug: 'q-incorrect-recent',
        stemMd: 'Incorrect recent',
      }),
      createQuestion({
        id: 'q-correct-old',
        slug: 'q-correct-old',
        stemMd: 'Correct old',
      }),
      createQuestion({
        id: 'q-incorrect-old',
        slug: 'q-incorrect-old',
        stemMd: 'Incorrect old',
      }),
    ];
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({
            userId: 'user-1',
            questionId: 'q-correct-recent',
            isCorrect: true,
            answeredAt: new Date('2026-02-04T00:00:00Z'),
          }),
          createAttempt({
            userId: 'user-1',
            questionId: 'q-incorrect-recent',
            isCorrect: false,
            answeredAt: new Date('2026-02-03T00:00:00Z'),
          }),
          createAttempt({
            userId: 'user-1',
            questionId: 'q-correct-old',
            isCorrect: true,
            answeredAt: new Date('2026-02-02T00:00:00Z'),
          }),
          createAttempt({
            userId: 'user-1',
            questionId: 'q-incorrect-old',
            isCorrect: false,
            answeredAt: new Date('2026-02-01T00:00:00Z'),
          }),
        ],
        { questions },
      ),
      new FakeQuestionRepository(questions),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-1',
      limit: 2,
      offset: 0,
      sort: 'incorrect-first',
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.questionId)).toEqual([
      'q-incorrect-recent',
      'q-incorrect-old',
    ]);
  });

  it('logs warning and returns unavailable row when attempted question references missing question', async () => {
    const orphanedQuestionId = 'q-orphaned';
    const logger = new FakeLogger();

    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: orphanedQuestionId,
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([]),
      logger,
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toEqual({
      rows: [
        {
          isAvailable: false,
          availability: null,
          questionId: orphanedQuestionId,
          isCorrect: true,
          sessionId: null,
          sessionMode: null,
          lastAnsweredAt: '2026-02-01T12:00:00.000Z',
        },
      ],
      limit: 10,
      offset: 0,
      totalCount: 1,
    });
    expect(logger.warnCalls).toEqual([
      {
        context: { questionId: orphanedQuestionId },
        msg: 'Attempted question references missing question',
      },
    ]);
  });

  it('includes session context (sessionId, sessionMode) on attempted question rows when available', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          practiceSessionId: 'session-1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
          sessionMode: 'exam',
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        {
          isAvailable: true,
          availability: 'available',
          questionId: 'q1',
          sessionId: 'session-1',
          sessionMode: 'exam',
        },
      ],
      totalCount: 1,
    });
  });

  it('returns empty page rows while preserving totalCount when offset is beyond available rows', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: false,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 10 }),
    ).resolves.toEqual({
      rows: [],
      limit: 10,
      offset: 10,
      totalCount: 1,
    });
  });

  it('preserves page rows even when count returns 0 (snapshot divergence)', async () => {
    const attempts = new FakeAttemptRepository([
      createAttempt({
        userId: 'user-1',
        questionId: 'q1',
        isCorrect: true,
        answeredAt: new Date('2026-02-01T12:00:00Z'),
      }),
    ]);
    attempts.countAttemptedQuestionsByUserId = async () => 0;

    const useCase = new GetAttemptedQuestionsUseCase(
      attempts,
      new FakeQuestionRepository([
        createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
      ]),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId: 'user-1',
      limit: 10,
      offset: 0,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      questionId: 'q1',
      isAvailable: true,
      availability: 'available',
    });
    expect(result.totalCount).toBe(0);
  });

  it('propagates repository failures', async () => {
    const attempts = new FakeAttemptRepository([]);
    attempts.countAttemptedQuestionsByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'Count failed');
    };

    const useCase = new GetAttemptedQuestionsUseCase(
      attempts,
      new FakeQuestionRepository([]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('includes tag slugs for available attempted questions', async () => {
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository([
        createAttempt({
          userId: 'user-1',
          questionId: 'q1',
          isCorrect: true,
          answeredAt: new Date('2026-02-01T12:00:00Z'),
        }),
      ]),
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
        }),
      ]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', limit: 10, offset: 0 }),
    ).resolves.toMatchObject({
      rows: [
        {
          isAvailable: true,
          availability: 'available',
          questionId: 'q1',
          slug: 'q-1',
          tagSlugs: ['opioids'],
        },
      ],
    });
  });

  // ADR-022 Decision 1: each row carries its question's availability.
  it("carries each question's availability, on answered and omitted rows", async () => {
    const held = createQuestion({ id: 'q-held', status: 'archived' });
    const withdrawn = createQuestion({ id: 'q-withdrawn', status: 'archived' });
    const questions = [held, withdrawn];
    const useCase = new GetAttemptedQuestionsUseCase(
      new FakeAttemptRepository(
        [
          createAttempt({ userId: 'user-1', questionId: 'q-held' }),
          createAttempt({
            userId: 'user-1',
            questionId: 'q-withdrawn',
            outcome: omittedOutcome(),
            isCorrect: false,
          }),
        ],
        { questions },
      ),
      new FakeQuestionRepository(questions, {
        holds: [
          {
            questionId: 'q-held',
            questionRevisionId: held.revisionId,
            lifted: false,
          },
        ],
        withdrawals: [
          {
            questionId: 'q-withdrawn',
            questionRevisionId: withdrawn.revisionId,
          },
        ],
      }),
      new FakeLogger(),
    );

    const { rows } = await useCase.execute({
      userId: 'user-1',
      limit: 10,
      offset: 0,
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isAvailable: true,
          questionId: 'q-held',
          availability: 'under_review',
        }),
        expect.objectContaining({
          isAvailable: false,
          questionId: 'q-withdrawn',
          availability: 'withdrawn',
        }),
      ]),
    );
  });
});
