import { describe, expect, it } from 'vitest';
import { createQuestion, createTag } from '@/src/domain/test-helpers';
import { FakeAttemptRepository } from './fake-attempt-repository';

type SeedAttempt = NonNullable<
  ConstructorParameters<typeof FakeAttemptRepository>[0]
>[number];

function makeAttempt(overrides: Partial<SeedAttempt> = {}): SeedAttempt {
  return {
    id: 'attempt-1',
    userId: 'user-1',
    questionId: 'q-1',
    practiceSessionId: null,
    selectedChoiceId: 'c-1',
    isCorrect: true,
    timeSpentSeconds: 0,
    retryOfAttemptId: null,
    retryOrigin: null,
    retrySessionId: null,
    answeredAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

describe('FakeAttemptRepository', () => {
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
    });
  });
});
