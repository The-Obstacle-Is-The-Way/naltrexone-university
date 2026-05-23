import { describe, expect, it } from 'vitest';
import { createQuestion, createTag } from '@/src/domain/test-helpers';
import {
  type AnswerOutcome,
  answeredOutcome,
} from '@/src/domain/value-objects';
import { FakeAttemptRepository } from './fake-attempt-repository';

type SeedAttempt = NonNullable<
  ConstructorParameters<typeof FakeAttemptRepository>[0]
>[number];
type VisibilitySeedAttempt = SeedAttempt;
type VisibilitySeedAttemptOverrides = Partial<Omit<SeedAttempt, 'outcome'>> & {
  outcome?: AnswerOutcome;
  selectedChoiceId?: string;
};

const userId = 'user-1';
const hiddenActiveExamAt = new Date('2026-04-25T12:00:00Z');
const visibleEndedExamAt = new Date('2026-04-25T11:00:00Z');
const visibleTutorAt = new Date('2026-04-25T10:00:00Z');
const visibleStandaloneAt = new Date('2026-04-25T09:00:00Z');

function makeAttempt(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  const { selectedChoiceId, ...attemptOverrides } = overrides;

  return {
    id: 'attempt-1',
    userId,
    questionId: 'q-1',
    practiceSessionId: null,
    outcome:
      attemptOverrides.outcome ?? answeredOutcome(selectedChoiceId ?? 'c-1'),
    isCorrect: true,
    timeSpentSeconds: 0,
    retryOfAttemptId: null,
    retryOrigin: null,
    retrySessionId: null,
    answeredAt: new Date('2026-02-01T00:00:00Z'),
    ...attemptOverrides,
  };
}

function activeExamSeed(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  return makeAttempt({
    id: 'attempt-active-exam',
    questionId: 'q-active-exam',
    practiceSessionId: 'session-active-exam',
    sessionMode: 'exam',
    sessionEndedAt: null,
    selectedChoiceId: 'choice-active-exam',
    isCorrect: true,
    answeredAt: hiddenActiveExamAt,
    ...overrides,
  });
}

function endedExamSeed(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  return activeExamSeed({
    id: 'attempt-ended-exam',
    questionId: 'q-ended-exam',
    practiceSessionId: 'session-ended-exam',
    sessionEndedAt: new Date('2026-04-01T00:00:00Z'),
    selectedChoiceId: 'choice-ended-exam',
    isCorrect: true,
    answeredAt: visibleEndedExamAt,
    ...overrides,
  });
}

function tutorSeed(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  return activeExamSeed({
    id: 'attempt-tutor',
    questionId: 'q-tutor',
    practiceSessionId: 'session-tutor',
    sessionMode: 'tutor',
    sessionEndedAt: null,
    selectedChoiceId: 'choice-tutor',
    isCorrect: true,
    answeredAt: visibleTutorAt,
    ...overrides,
  });
}

function standaloneSeed(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  return activeExamSeed({
    id: 'attempt-standalone',
    questionId: 'q-standalone',
    practiceSessionId: null,
    sessionMode: null,
    sessionEndedAt: null,
    selectedChoiceId: 'choice-standalone',
    isCorrect: true,
    answeredAt: visibleStandaloneAt,
    ...overrides,
  });
}

function legacyExamSeed(
  overrides: VisibilitySeedAttemptOverrides = {},
): VisibilitySeedAttempt {
  const attempt = activeExamSeed({
    id: 'attempt-legacy-exam',
    questionId: 'q-legacy-exam',
    ...overrides,
  });
  delete attempt.sessionEndedAt;
  return attempt;
}

describe('FakeAttemptRepository', () => {
  describe('active-exam visibility fidelity', () => {
    it('keeps legacy exam-shaped seeds visible when sessionEndedAt is omitted', async () => {
      const attempt = legacyExamSeed();
      const repo = new FakeAttemptRepository([attempt]);

      await expect(repo.countByUserId(userId)).resolves.toBe(1);
      await expect(
        repo.findLatestByUserAndQuestion(userId, attempt.questionId),
      ).resolves.toMatchObject({ id: attempt.id });
    });

    describe.each([
      {
        name: 'countByUserId',
        read: (repo: FakeAttemptRepository) => repo.countByUserId(userId),
        empty: 0,
        visible: 1,
        mixed: 3,
      },
      {
        name: 'countCorrectByUserId',
        read: (repo: FakeAttemptRepository) =>
          repo.countCorrectByUserId(userId),
        empty: 0,
        visible: 1,
        mixed: 3,
      },
      {
        name: 'countByUserIdSince',
        read: (repo: FakeAttemptRepository) =>
          repo.countByUserIdSince(userId, new Date('2026-04-25T00:00:00Z')),
        empty: 0,
        visible: 1,
        mixed: 3,
      },
      {
        name: 'countCorrectByUserIdSince',
        read: (repo: FakeAttemptRepository) =>
          repo.countCorrectByUserIdSince(
            userId,
            new Date('2026-04-25T00:00:00Z'),
          ),
        empty: 0,
        visible: 1,
        mixed: 3,
      },
      {
        name: 'countAttemptedQuestionsByUserId',
        read: (repo: FakeAttemptRepository) =>
          repo.countAttemptedQuestionsByUserId(userId),
        empty: 0,
        visible: 1,
        mixed: 3,
      },
    ])('$name', ({ read, empty, visible, mixed }) => {
      it('hides active-exam attempts', async () => {
        const repo = new FakeAttemptRepository([activeExamSeed()]);

        await expect(read(repo)).resolves.toBe(empty);
      });

      it.each([
        ['ended exam', endedExamSeed],
        ['tutor', tutorSeed],
        ['standalone', standaloneSeed],
      ])('keeps %s attempts visible', async (_name, seed) => {
        const repo = new FakeAttemptRepository([seed()]);

        await expect(read(repo)).resolves.toBe(visible);
      });

      it('hides only active-exam attempts from a mixed seed', async () => {
        const repo = new FakeAttemptRepository([
          activeExamSeed(),
          endedExamSeed(),
          tutorSeed(),
          standaloneSeed(),
        ]);

        await expect(read(repo)).resolves.toBe(mixed);
      });
    });

    describe('listRecentByUserId', () => {
      it('hides active-exam attempts', async () => {
        const repo = new FakeAttemptRepository([activeExamSeed()]);

        await expect(repo.listRecentByUserId(userId, 10)).resolves.toEqual([]);
      });

      it.each([
        ['ended exam', endedExamSeed],
        ['tutor', tutorSeed],
        ['standalone', standaloneSeed],
      ])('keeps %s attempts visible', async (_name, seed) => {
        const attempt = seed();
        const repo = new FakeAttemptRepository([attempt]);

        await expect(
          repo.listRecentByUserId(userId, 10),
        ).resolves.toMatchObject([{ id: attempt.id }]);
      });

      it('hides only active-exam attempts from a mixed seed', async () => {
        const repo = new FakeAttemptRepository([
          activeExamSeed(),
          endedExamSeed(),
          tutorSeed(),
          standaloneSeed(),
        ]);

        const result = await repo.listRecentByUserId(userId, 10);

        expect(result.map((attempt) => attempt.id)).toEqual([
          'attempt-ended-exam',
          'attempt-tutor',
          'attempt-standalone',
        ]);
      });
    });

    describe('listAnsweredAtByUserIdSince', () => {
      it('hides active-exam attempts', async () => {
        const repo = new FakeAttemptRepository([activeExamSeed()]);

        await expect(
          repo.listAnsweredAtByUserIdSince(
            userId,
            new Date('2026-04-25T00:00:00Z'),
          ),
        ).resolves.toEqual([]);
      });

      it.each([
        ['ended exam', endedExamSeed],
        ['tutor', tutorSeed],
        ['standalone', standaloneSeed],
      ])('keeps %s attempts visible', async (_name, seed) => {
        const attempt = seed();
        const repo = new FakeAttemptRepository([attempt]);

        await expect(
          repo.listAnsweredAtByUserIdSince(
            userId,
            new Date('2026-04-25T00:00:00Z'),
          ),
        ).resolves.toEqual([attempt.answeredAt]);
      });

      it('hides only active-exam attempts from a mixed seed', async () => {
        const repo = new FakeAttemptRepository([
          activeExamSeed(),
          endedExamSeed(),
          tutorSeed(),
          standaloneSeed(),
        ]);

        await expect(
          repo.listAnsweredAtByUserIdSince(
            userId,
            new Date('2026-04-25T00:00:00Z'),
          ),
        ).resolves.toEqual([
          visibleEndedExamAt,
          visibleTutorAt,
          visibleStandaloneAt,
        ]);
      });
    });

    describe('findLatestByUserAndQuestion', () => {
      it('hides active-exam attempts', async () => {
        const repo = new FakeAttemptRepository([
          activeExamSeed({ questionId: 'q-shared' }),
        ]);

        await expect(
          repo.findLatestByUserAndQuestion(userId, 'q-shared'),
        ).resolves.toBeNull();
      });

      it.each([
        ['ended exam', endedExamSeed],
        ['tutor', tutorSeed],
        ['standalone', standaloneSeed],
      ])('keeps %s attempts visible', async (_name, seed) => {
        const attempt = seed({ questionId: 'q-shared' });
        const repo = new FakeAttemptRepository([attempt]);

        await expect(
          repo.findLatestByUserAndQuestion(userId, 'q-shared'),
        ).resolves.toMatchObject({ id: attempt.id });
      });

      it('falls back to the older visible attempt when a newer active-exam attempt is hidden', async () => {
        const repo = new FakeAttemptRepository([
          standaloneSeed({
            id: 'attempt-visible-older',
            questionId: 'q-shared',
            answeredAt: new Date('2026-04-25T10:00:00Z'),
          }),
          activeExamSeed({
            id: 'attempt-hidden-newer',
            questionId: 'q-shared',
            answeredAt: new Date('2026-04-25T11:00:00Z'),
          }),
        ]);

        await expect(
          repo.findLatestByUserAndQuestion(userId, 'q-shared'),
        ).resolves.toMatchObject({ id: 'attempt-visible-older' });
      });
    });

    describe('listAttemptedQuestionsByUserId / countAttemptedQuestionsByUserId', () => {
      it('hides active-exam attempts', async () => {
        const repo = new FakeAttemptRepository([
          activeExamSeed({ questionId: 'q-active-only' }),
        ]);

        await expect(
          repo.listAttemptedQuestionsByUserId(userId, 10, 0),
        ).resolves.toEqual([]);
        await expect(
          repo.countAttemptedQuestionsByUserId(userId),
        ).resolves.toBe(0);
      });

      it.each([
        ['ended exam', endedExamSeed],
        ['tutor', tutorSeed],
        ['standalone', standaloneSeed],
      ])('keeps %s attempts visible', async (_name, seed) => {
        const attempt = seed({ questionId: 'q-visible' });
        const repo = new FakeAttemptRepository([attempt]);

        await expect(
          repo.listAttemptedQuestionsByUserId(userId, 10, 0),
        ).resolves.toMatchObject([
          {
            questionId: 'q-visible',
            answeredAt: attempt.answeredAt,
            isCorrect: attempt.isCorrect,
          },
        ]);
        await expect(
          repo.countAttemptedQuestionsByUserId(userId),
        ).resolves.toBe(1);
      });

      it('filters before latest-attempt ranking so older visible attempts remain surfaced', async () => {
        const repo = new FakeAttemptRepository([
          tutorSeed({
            id: 'attempt-visible-older',
            questionId: 'q-shared',
            isCorrect: true,
            answeredAt: new Date('2026-04-25T10:00:00Z'),
          }),
          activeExamSeed({
            id: 'attempt-hidden-newer',
            questionId: 'q-shared',
            isCorrect: false,
            answeredAt: new Date('2026-04-25T11:00:00Z'),
          }),
          endedExamSeed({ questionId: 'q-ended' }),
          standaloneSeed({ questionId: 'q-standalone' }),
        ]);

        const result = await repo.listAttemptedQuestionsByUserId(userId, 10, 0);

        expect(result).toMatchObject([
          { questionId: 'q-ended' },
          { questionId: 'q-shared', isCorrect: true },
          { questionId: 'q-standalone' },
        ]);
        await expect(
          repo.countAttemptedQuestionsByUserId(userId),
        ).resolves.toBe(3);
      });
    });

    describe('findMostRecentAnsweredAtByQuestionIds', () => {
      it('hides active-exam attempts', async () => {
        const repo = new FakeAttemptRepository([
          activeExamSeed({ questionId: 'q-active-only' }),
        ]);

        await expect(
          repo.findMostRecentAnsweredAtByQuestionIds(userId, ['q-active-only']),
        ).resolves.toEqual([]);
      });

      it.each([
        ['ended exam', endedExamSeed],
        ['tutor', tutorSeed],
        ['standalone', standaloneSeed],
      ])('keeps %s attempts visible', async (_name, seed) => {
        const attempt = seed({ questionId: 'q-visible' });
        const repo = new FakeAttemptRepository([attempt]);

        await expect(
          repo.findMostRecentAnsweredAtByQuestionIds(userId, ['q-visible']),
        ).resolves.toEqual([
          { questionId: 'q-visible', answeredAt: attempt.answeredAt },
        ]);
      });

      it('aggregates after filtering so an older visible timestamp wins over a hidden newer one', async () => {
        const repo = new FakeAttemptRepository([
          endedExamSeed({
            id: 'attempt-visible-older',
            questionId: 'q-shared',
            answeredAt: new Date('2026-04-25T10:00:00Z'),
          }),
          activeExamSeed({
            id: 'attempt-hidden-newer',
            questionId: 'q-shared',
            answeredAt: new Date('2026-04-25T11:00:00Z'),
          }),
          standaloneSeed({
            id: 'attempt-visible-other',
            questionId: 'q-other',
            answeredAt: new Date('2026-04-25T09:00:00Z'),
          }),
        ]);

        const result = await repo.findMostRecentAnsweredAtByQuestionIds(
          userId,
          ['q-shared', 'q-other'],
        );
        const byQuestionId = (
          left: (typeof result)[number],
          right: (typeof result)[number],
        ) => left.questionId.localeCompare(right.questionId);

        expect([...result].sort(byQuestionId)).toEqual([
          {
            questionId: 'q-other',
            answeredAt: new Date('2026-04-25T09:00:00Z'),
          },
          {
            questionId: 'q-shared',
            answeredAt: new Date('2026-04-25T10:00:00Z'),
          },
        ]);
      });
    });
  });

  describe('count*', () => {
    it('counts attempts with correctness and since filters', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({
          id: 'attempt-1',
          questionId: 'q-1',
          selectedChoiceId: 'c-1',
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-2',
          questionId: 'q-2',
          selectedChoiceId: 'c-2',
          isCorrect: false,
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-3',
          userId: 'other',
          questionId: 'q-3',
          selectedChoiceId: 'c-3',
          answeredAt: new Date('2026-02-04T00:00:00Z'),
        }),
      ]);

      await expect(repo.countByUserId('user-1')).resolves.toBe(2);
      await expect(repo.countCorrectByUserId('user-1')).resolves.toBe(1);

      const since = new Date('2026-02-02T00:00:00Z');
      await expect(repo.countByUserIdSince('user-1', since)).resolves.toBe(1);
      await expect(
        repo.countCorrectByUserIdSince('user-1', since),
      ).resolves.toBe(0);
    });
  });

  describe('findByUserId', () => {
    it('returns attempts in descending answeredAt order (paginated)', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({
          id: 'attempt-1',
          questionId: 'q-1',
          selectedChoiceId: 'c-1',
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-2',
          questionId: 'q-2',
          selectedChoiceId: 'c-2',
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-3',
          questionId: 'q-3',
          selectedChoiceId: 'c-3',
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        }),
      ]);

      const result = await repo.findByUserId('user-1', { limit: 2, offset: 1 });

      expect(result.map((a) => a.id)).toEqual(['attempt-3', 'attempt-1']);
    });

    it('clamps negative offsets to 0', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({
          id: 'attempt-1',
          questionId: 'q-1',
          selectedChoiceId: 'c-1',
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-2',
          questionId: 'q-2',
          selectedChoiceId: 'c-2',
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-3',
          questionId: 'q-3',
          selectedChoiceId: 'c-3',
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        }),
      ]);

      const result = await repo.findByUserId('user-1', {
        limit: 2,
        offset: -1,
      });

      expect(result.map((a) => a.id)).toEqual(['attempt-2', 'attempt-3']);
    });

    it('returns empty array when limit is <= 0', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({
          id: 'attempt-1',
          questionId: 'q-1',
          selectedChoiceId: 'c-1',
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-2',
          questionId: 'q-2',
          selectedChoiceId: 'c-2',
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-3',
          questionId: 'q-3',
          selectedChoiceId: 'c-3',
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        }),
      ]);

      await expect(
        repo.findByUserId('user-1', { limit: 0, offset: 0 }),
      ).resolves.toEqual([]);
      await expect(
        repo.findByUserId('user-1', { limit: -1, offset: 0 }),
      ).resolves.toEqual([]);
    });
  });

  describe('findByIdAndUserId', () => {
    it('returns attempt when id and userId match', async () => {
      const attempt = makeAttempt({ id: 'attempt-1' });
      const repo = new FakeAttemptRepository([attempt]);

      await expect(
        repo.findByIdAndUserId('attempt-1', 'user-1'),
      ).resolves.toEqual(attempt);
    });

    it('returns null when attempt exists but belongs to a different user', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({ id: 'attempt-1' }),
      ]);

      await expect(
        repo.findByIdAndUserId('attempt-1', 'user-2'),
      ).resolves.toBeNull();
    });

    it('returns null when attempt does not exist', async () => {
      const repo = new FakeAttemptRepository([]);

      await expect(
        repo.findByIdAndUserId('attempt-missing', 'user-1'),
      ).resolves.toBeNull();
    });
  });

  describe('findBySessionIdAndQuestionId', () => {
    it('returns attempt when sessionId, userId, and questionId match', async () => {
      const attempt = makeAttempt({
        id: 'attempt-1',
        practiceSessionId: 'session-1',
        questionId: 'q-1',
      });
      const repo = new FakeAttemptRepository([attempt]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-1', 'user-1', 'q-1'),
      ).resolves.toEqual(attempt);
    });

    it('returns null when sessionId matches but questionId differs', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({ id: 'attempt-1', practiceSessionId: 'session-1' }),
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-1', 'user-1', 'q-2'),
      ).resolves.toBeNull();
    });

    it('returns null when sessionId matches but userId differs', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({ id: 'attempt-1', practiceSessionId: 'session-1' }),
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-1', 'user-2', 'q-1'),
      ).resolves.toBeNull();
    });

    it('returns null when sessionId does not exist', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({ id: 'attempt-1', practiceSessionId: 'session-1' }),
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-missing', 'user-1', 'q-1'),
      ).resolves.toBeNull();
    });
  });

  describe('listRecentByUserId', () => {
    it('returns attempts in descending answeredAt order (limited)', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({
          id: 'attempt-1',
          questionId: 'q-1',
          selectedChoiceId: 'c-1',
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-2',
          questionId: 'q-2',
          selectedChoiceId: 'c-2',
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-3',
          questionId: 'q-3',
          selectedChoiceId: 'c-3',
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        }),
      ]);

      const result = await repo.listRecentByUserId('user-1', 2);

      expect(result.map((a) => a.id)).toEqual(['attempt-2', 'attempt-3']);
    });
  });

  describe('listAnsweredAtByUserIdSince', () => {
    it('returns answeredAt values in descending order', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({
          id: 'attempt-1',
          questionId: 'q-1',
          selectedChoiceId: 'c-1',
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-2',
          questionId: 'q-2',
          selectedChoiceId: 'c-2',
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-3',
          questionId: 'q-3',
          selectedChoiceId: 'c-3',
          answeredAt: new Date('2026-01-01T00:00:00Z'),
        }),
        makeAttempt({
          id: 'attempt-4',
          userId: 'other',
          questionId: 'q-4',
          selectedChoiceId: 'c-4',
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        }),
      ]);

      await expect(
        repo.listAnsweredAtByUserIdSince(
          'user-1',
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).resolves.toEqual([
        new Date('2026-02-03T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
      ]);
    });
  });

  describe('listAttemptedQuestionsByUserId (attempted-question filters)', () => {
    it('filters by difficulty and tagSlug using question metadata', async () => {
      const qEasy = createQuestion({
        id: 'q_easy',
        difficulty: 'easy',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      });
      const qHardAlcohol = createQuestion({
        id: 'q_hard_alcohol',
        difficulty: 'hard',
        tags: [createTag({ slug: 'alcohol', name: 'Alcohol' })],
      });
      const qHardOpioids = createQuestion({
        id: 'q_hard_opioids',
        difficulty: 'hard',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      });
      const qHardDraft = createQuestion({
        id: 'q_hard_draft',
        difficulty: 'hard',
        status: 'draft',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      });

      const repo = new FakeAttemptRepository(
        [
          makeAttempt({
            id: 'attempt-1',
            questionId: qEasy.id,
            selectedChoiceId: 'choice-1',
            answeredAt: new Date('2026-02-01T00:00:00Z'),
          }),
          makeAttempt({
            id: 'attempt-2',
            questionId: qHardAlcohol.id,
            selectedChoiceId: 'choice-2',
            answeredAt: new Date('2026-02-02T00:00:00Z'),
          }),
          makeAttempt({
            id: 'attempt-3',
            questionId: qHardOpioids.id,
            selectedChoiceId: 'choice-3',
            answeredAt: new Date('2026-02-03T00:00:00Z'),
          }),
          makeAttempt({
            id: 'attempt-4',
            questionId: qHardDraft.id,
            selectedChoiceId: 'choice-4',
            answeredAt: new Date('2026-02-04T00:00:00Z'),
          }),
        ],
        { questions: [qEasy, qHardAlcohol, qHardOpioids, qHardDraft] },
      );

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
        }),
      ).resolves.toMatchObject([
        { questionId: qHardOpioids.id },
        { questionId: qHardAlcohol.id },
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          tagSlug: 'opioids',
        }),
      ).resolves.toMatchObject([
        { questionId: qHardOpioids.id },
        { questionId: qEasy.id },
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
          tagSlug: 'opioids',
        }),
      ).resolves.toMatchObject([{ questionId: qHardOpioids.id }]);

      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
        }),
      ).resolves.toBe(2);
      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          tagSlug: 'opioids',
        }),
      ).resolves.toBe(2);
      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
          tagSlug: 'opioids',
        }),
      ).resolves.toBe(1);
    });

    it('throws when difficulty/tagSlug filters are used without questions metadata', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({ id: 'attempt-1' }),
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });

      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
