import { describe, expect, it } from 'vitest';
import { createQuestion, createTag } from '@/src/domain/test-helpers';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import { FakeAttemptRepository } from './fake-attempt-repository';
import { makeAttempt, userId } from './fake-attempt-repository-seeds';

describe('FakeAttemptRepository', () => {
  it('rejects omitted attempts marked correct', async () => {
    const repo = new FakeAttemptRepository();

    await expect(
      repo.insert({
        userId,
        questionId: 'q-omitted',
        questionRevisionId: crypto.randomUUID(),
        practiceSessionId: 'session-omitted',
        outcome: omittedOutcome(),
        isCorrect: true,
        timeSpentSeconds: 0,
      }),
    ).rejects.toThrow('Omitted attempts must be incorrect');
  });

  // ADR-021: the revision the attempt was graded against.
  it('stores the revision it is given', async () => {
    const repo = new FakeAttemptRepository();
    const questionRevisionId = crypto.randomUUID();

    const attempt = await repo.insert({
      userId,
      questionId: 'q-revision',
      questionRevisionId,
      practiceSessionId: null,
      outcome: answeredOutcome('c-1'),
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    expect(attempt.questionRevisionId).toBe(questionRevisionId);
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

      const since = new Date('2026-02-02T00:00:00Z');
      await expect(repo.countByUserIdSince('user-1', since)).resolves.toBe(1);
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
    it('reports whether each latest attempt was omitted', async () => {
      const repo = new FakeAttemptRepository([
        makeAttempt({ id: 'attempt-answered', questionId: 'q_answered' }),
        makeAttempt({
          id: 'attempt-omitted',
          questionId: 'q_omitted',
          outcome: omittedOutcome(),
          isCorrect: false,
        }),
      ]);

      const rows = await repo.listAttemptedQuestionsByUserId(userId, 10, 0);

      expect(
        rows.map(({ questionId, isOmitted }) => ({ questionId, isOmitted })),
      ).toEqual(
        expect.arrayContaining([
          { questionId: 'q_answered', isOmitted: false },
          { questionId: 'q_omitted', isOmitted: true },
        ]),
      );
    });

    // DEBT-493 increment 5: a question no longer published sorts by the
    // difficulty answered, as the filters read it.
    it("sorts by the difficulty each attempt answered, whatever the question's state, ties by recency", async () => {
      const hard = createQuestion({ id: 'q_hard', difficulty: 'hard' });
      const medium = createQuestion({ id: 'q_medium', difficulty: 'medium' });
      // ADR-021: now hard, but answered while it was easy.
      const revisedNow = createQuestion({
        id: 'q_revised',
        difficulty: 'hard',
      });
      const revisedAnswered = createQuestion({
        id: 'q_revised',
        revisionId: crypto.randomUUID(),
        difficulty: 'easy',
      });
      const draftHard = createQuestion({
        id: 'q_draft',
        difficulty: 'hard',
        status: 'draft',
      });
      const repo = new FakeAttemptRepository(
        [
          makeAttempt({
            id: 'attempt-hard',
            questionId: hard.id,
            answeredAt: new Date('2026-02-01T00:00:00Z'),
          }),
          makeAttempt({
            id: 'attempt-medium',
            questionId: medium.id,
            answeredAt: new Date('2026-02-02T00:00:00Z'),
          }),
          makeAttempt({
            id: 'attempt-revised',
            questionId: revisedNow.id,
            questionRevisionId: revisedAnswered.revisionId,
            answeredAt: new Date('2026-02-03T00:00:00Z'),
          }),
          makeAttempt({
            id: 'attempt-draft',
            questionId: draftHard.id,
            answeredAt: new Date('2026-02-04T00:00:00Z'),
          }),
        ],
        { questions: [hard, medium, revisedNow, revisedAnswered, draftHard] },
      );

      const rows = await repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
        sort: 'difficulty',
      });

      expect(rows.map((row) => row.questionId)).toEqual([
        'q_draft',
        'q_hard',
        'q_medium',
        'q_revised',
      ]);
    });

    // DEBT-493 increment 5: a question no longer published keeps its place
    // under a filter, as it does unfiltered.
    it("filters by difficulty and tagSlug using question metadata, whatever the question's state", async () => {
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
        { questionId: qHardDraft.id },
        { questionId: qHardOpioids.id },
        { questionId: qHardAlcohol.id },
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          tagSlug: 'opioids',
        }),
      ).resolves.toMatchObject([
        { questionId: qHardDraft.id },
        { questionId: qHardOpioids.id },
        { questionId: qEasy.id },
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
          tagSlug: 'opioids',
        }),
      ).resolves.toMatchObject([
        { questionId: qHardDraft.id },
        { questionId: qHardOpioids.id },
      ]);

      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
        }),
      ).resolves.toBe(3);
      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          tagSlug: 'opioids',
        }),
      ).resolves.toBe(3);
      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
          tagSlug: 'opioids',
        }),
      ).resolves.toBe(2);
    });

    // ADR-021: the adapter filters by the question's tags and the answered
    // revision's difficulty.
    it("filters by the question's tags and the difficulty the attempt answered", async () => {
      const current = createQuestion({
        id: 'q1',
        status: 'published',
        difficulty: 'hard',
        tags: [createTag({ slug: 'opioids' })],
      });
      const answered = createQuestion({
        id: 'q1',
        revisionId: crypto.randomUUID(),
        status: 'archived',
        difficulty: 'easy',
        tags: [],
      });
      const repo = new FakeAttemptRepository(
        [
          makeAttempt({
            questionId: 'q1',
            questionRevisionId: answered.revisionId,
          }),
        ],
        { questions: [current, answered] },
      );
      const filters = { difficulty: 'easy', tagSlug: 'opioids' } as const;

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, filters),
      ).resolves.toEqual([expect.objectContaining({ questionId: 'q1' })]);
      await expect(
        repo.countAttemptedQuestionsByUserId(userId, filters),
      ).resolves.toBe(1);
    });

    // ADR-021: every attempt names its revision, which the adapter's
    // composite key makes one of its question's.
    it('refuses an attempt whose revision the listed question does not hold', async () => {
      const repo = new FakeAttemptRepository(
        [
          makeAttempt({
            id: 'attempt-unheld',
            questionId: 'q1',
            questionRevisionId: crypto.randomUUID(),
          }),
          makeAttempt({ id: 'attempt-held', questionId: 'q2' }),
        ],
        {
          questions: [
            createQuestion({ id: 'q1', difficulty: 'hard' }),
            createQuestion({ id: 'q2', difficulty: 'hard' }),
          ],
        },
      );

      await expect(
        repo.listAttemptedQuestionsByUserId(userId, 10, 0, {
          sort: 'difficulty',
        }),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
      await expect(
        repo.countAttemptedQuestionsByUserId(userId, { difficulty: 'hard' }),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
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
