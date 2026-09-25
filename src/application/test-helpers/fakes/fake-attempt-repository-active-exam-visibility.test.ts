import { describe, expect, it } from 'vitest';
import { FakeAttemptRepository } from './fake-attempt-repository';
import {
  makeAttempt,
  userId,
  type VisibilitySeedAttempt,
  type VisibilitySeedAttemptOverrides,
} from './fake-attempt-repository-seeds';

const hiddenActiveExamAt = new Date('2026-04-25T12:00:00Z');
const visibleEndedExamAt = new Date('2026-04-25T11:00:00Z');
const visibleTutorAt = new Date('2026-04-25T10:00:00Z');
const visibleStandaloneAt = new Date('2026-04-25T09:00:00Z');

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
});
