import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createTag,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzlePracticeSessionRepository + DrizzleAttemptRepository', () => {
  it('inserts attempts and enforces user scoping on findBySessionId', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);

    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const session = await sessionRepo.create({
      userId: userA.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await attemptRepo.insert({
      userId: userA.id,
      questionId: question.id,
      practiceSessionId: session.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 10,
    });

    const attemptsForA = await attemptRepo.findBySessionId(
      session.id,
      userA.id,
    );
    expect(attemptsForA).toHaveLength(1);

    const attemptsForB = await attemptRepo.findBySessionId(
      session.id,
      userB.id,
    );
    expect(attemptsForB).toHaveLength(0);
  });

  it('returns null from findLatestByUserAndQuestion when no attempts exist', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toBeNull();
  });

  it('returns the most recent attempt from findLatestByUserAndQuestion', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const choices = await db
      .select({ id: schema.choices.id })
      .from(schema.choices)
      .where(eq(schema.choices.questionId, question.id));

    const incorrectChoiceId = choices.find(
      (c) => c.id !== question.correctChoiceId,
    )?.id;
    if (!incorrectChoiceId) throw new Error('Missing incorrect choice');

    const attemptRepo = new DrizzleAttemptRepository(db);

    const first = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: incorrectChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const second = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-06T00:00:00.000Z');
    const t2 = new Date('2026-02-07T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, first.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, second.id));

    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      id: second.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
  });

  it('uses id desc as a deterministic tie-breaker for findLatestByUserAndQuestion', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const tieAnsweredAt = new Date('2026-02-06T00:00:00.000Z');
    const lowerId = '00000000-0000-4000-8000-000000000001';
    const higherId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

    await db.insert(schema.attempts).values([
      {
        id: lowerId,
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
      {
        id: higherId,
        userId: user.id,
        questionId: question.id,
        practiceSessionId: null,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
    ]);

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findLatestByUserAndQuestion(user.id, question.id),
    ).resolves.toMatchObject({
      id: higherId,
      isCorrect: true,
    });
  });

  it('returns attempt from findByIdAndUserId when id and userId match', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attempt = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findByIdAndUserId(attempt.id, user.id),
    ).resolves.toMatchObject({
      id: attempt.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
    });
  });

  it('returns null from findByIdAndUserId when id exists but userId does not match', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attempt = await attemptRepo.insert({
      userId: userA.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findByIdAndUserId(attempt.id, userB.id),
    ).resolves.toBeNull();
  });

  it('returns null from findByIdAndUserId when id does not exist', async () => {
    const user = await createUser(db, cleanup);

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findByIdAndUserId(randomUUID(), user.id),
    ).resolves.toBeNull();
  });

  it('returns attempt from findBySessionIdAndQuestionId when sessionId, questionId, and userId match', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attempt = await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: session.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findBySessionIdAndQuestionId(
        session.id,
        user.id,
        question.id,
      ),
    ).resolves.toMatchObject({
      id: attempt.id,
      userId: user.id,
      questionId: question.id,
    });
  });

  it('returns null from findBySessionIdAndQuestionId when sessionId exists but questionId does not match', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: session.id,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findBySessionIdAndQuestionId(session.id, user.id, q2.id),
    ).resolves.toBeNull();
  });

  it('returns null from findBySessionIdAndQuestionId when sessionId exists but userId does not match', async () => {
    const userA = await createUser(db, cleanup);
    const userB = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: userA.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await attemptRepo.insert({
      userId: userA.id,
      questionId: question.id,
      practiceSessionId: session.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      attemptRepo.findBySessionIdAndQuestionId(
        session.id,
        userB.id,
        question.id,
      ),
    ).resolves.toBeNull();
  });

  it('returns null from findBySessionIdAndQuestionId when sessionId does not exist', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await expect(
      attemptRepo.findBySessionIdAndQuestionId(
        randomUUID(),
        user.id,
        question.id,
      ),
    ).resolves.toBeNull();
  });

  it('rejects deleting a choice referenced by an attempt', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);
    await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    await expect(
      db
        .delete(schema.choices)
        .where(eq(schema.choices.id, question.correctChoiceId)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('ends practice sessions once', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    const created = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const ended = await sessionRepo.end(created.id, user.id);
    expect(ended.endedAt).not.toBeNull();

    await expect(sessionRepo.end(created.id, user.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('returns per-question most recent answeredAt', async () => {
    const user = await createUser(db, cleanup);

    const q1 = await createQuestion(db, cleanup, {
      slug: `it-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const q2 = await createQuestion(db, cleanup, {
      slug: `it-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const a1 = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const a2 = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const b1 = await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-01-01T00:00:00.000Z');
    const t2 = new Date('2026-01-02T00:00:00.000Z');
    const t3 = new Date('2026-01-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, a1.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, a2.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, b1.id));

    const mostRecent = await attemptRepo.findMostRecentAnsweredAtByQuestionIds(
      user.id,
      [q1.id, q2.id],
    );

    const byQuestionId = new Map(
      mostRecent.map((r) => [r.questionId, r.answeredAt]),
    );
    expect(byQuestionId.get(q1.id)?.toISOString()).toBe(t2.toISOString());
    expect(byQuestionId.get(q2.id)?.toISOString()).toBe(t3.toISOString());
  });

  it('lists attempted questions by latest attempt per question', async () => {
    const user = await createUser(db, cleanup);

    const q1 = await createQuestion(db, cleanup, {
      slug: `it-attempted-q1-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const q2 = await createQuestion(db, cleanup, {
      slug: `it-attempted-q2-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const q1Correct = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const q1Incorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: null,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const q2Incorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const q2Correct = await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-01-01T00:00:00.000Z');
    const t2 = new Date('2026-01-02T00:00:00.000Z');
    const t3 = new Date('2026-01-03T00:00:00.000Z');
    const t4 = new Date('2026-01-04T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, q1Correct.id));

    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, q1Incorrect.id));

    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, q2Incorrect.id));

    await db
      .update(schema.attempts)
      .set({ answeredAt: t4 })
      .where(eq(schema.attempts.id, q2Correct.id));

    const attempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );

    expect(attempted.map((m) => m.questionId)).toEqual([q2.id, q1.id]);
    expect(attempted[0]).toMatchObject({
      questionId: q2.id,
      isCorrect: true,
      sessionId: null,
      sessionMode: null,
    });
    expect(attempted[0]?.answeredAt.toISOString()).toBe(t4.toISOString());
    expect(attempted[1]).toMatchObject({
      questionId: q1.id,
      isCorrect: false,
      sessionId: null,
      sessionMode: null,
    });
    expect(attempted[1]?.answeredAt.toISOString()).toBe(t2.toISOString());

    const incorrectOnly = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { result: 'incorrect' },
    );
    expect(incorrectOnly.map((m) => m.questionId)).toEqual([q1.id]);
  });

  it('supports attempted-question difficulty filter and accurate counts', async () => {
    const user = await createUser(db, cleanup);

    const qEasy = await createQuestion(db, cleanup, {
      slug: `it-attempted-difficulty-easy-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qHardA = await createQuestion(db, cleanup, {
      slug: `it-attempted-difficulty-hard-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const qHardB = await createQuestion(db, cleanup, {
      slug: `it-attempted-difficulty-hard-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const aEasy = await attemptRepo.insert({
      userId: user.id,
      questionId: qEasy.id,
      practiceSessionId: null,
      selectedChoiceId: qEasy.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const aHardA = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardA.id,
      practiceSessionId: null,
      selectedChoiceId: qHardA.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const aHardB = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardB.id,
      practiceSessionId: null,
      selectedChoiceId: qHardB.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, aEasy.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, aHardA.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, aHardB.id));

    const hardOnly = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { difficulty: 'hard' },
    );
    expect(hardOnly.map((m) => m.questionId)).toEqual([qHardB.id, qHardA.id]);

    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        difficulty: 'hard',
      }),
    ).resolves.toBe(2);
  });

  it('supports attempted-question tagSlug filter and accurate counts', async () => {
    const user = await createUser(db, cleanup);

    const tagPharm = await createTag(db, cleanup, {
      slug: `it-tag-pharmacology-${randomUUID()}`,
      kind: 'topic',
      name: 'Pharmacology',
    });

    const tagOther = await createTag(db, cleanup, {
      slug: `it-tag-other-${randomUUID()}`,
      kind: 'topic',
      name: 'Other',
    });

    const qPharmA = await createQuestion(db, cleanup, {
      slug: `it-attempted-tag-pharm-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tagPharm.id],
    });
    const qPharmB = await createQuestion(db, cleanup, {
      slug: `it-attempted-tag-pharm-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
      tagIds: [tagPharm.id],
    });
    const qOther = await createQuestion(db, cleanup, {
      slug: `it-attempted-tag-other-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tagOther.id],
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const aOther = await attemptRepo.insert({
      userId: user.id,
      questionId: qOther.id,
      practiceSessionId: null,
      selectedChoiceId: qOther.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });
    const aPharmA = await attemptRepo.insert({
      userId: user.id,
      questionId: qPharmA.id,
      practiceSessionId: null,
      selectedChoiceId: qPharmA.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });
    const aPharmB = await attemptRepo.insert({
      userId: user.id,
      questionId: qPharmB.id,
      practiceSessionId: null,
      selectedChoiceId: qPharmB.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, aOther.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, aPharmA.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, aPharmB.id));

    const pharmOnly = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { tagSlug: tagPharm.slug },
    );
    expect(pharmOnly.map((m) => m.questionId)).toEqual([
      qPharmB.id,
      qPharmA.id,
    ]);

    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        tagSlug: tagPharm.slug,
      }),
    ).resolves.toBe(2);
  });

  it('supports combined attempted-question result + difficulty filters', async () => {
    const user = await createUser(db, cleanup);

    const qHardIncorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-result-difficulty-hard-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const qHardCorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-result-difficulty-hard-correct-${randomUUID()}`,
      status: 'published',
      difficulty: 'hard',
    });
    const qEasyIncorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-result-difficulty-easy-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const attemptRepo = new DrizzleAttemptRepository(db);

    const aHardIncorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardIncorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qHardIncorrect.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const aHardCorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: qHardCorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qHardCorrect.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 1,
    });

    const aEasyIncorrect = await attemptRepo.insert({
      userId: user.id,
      questionId: qEasyIncorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qEasyIncorrect.correctChoiceId,
      isCorrect: false,
      timeSpentSeconds: 1,
    });

    const t1 = new Date('2026-02-01T00:00:00.000Z');
    const t2 = new Date('2026-02-02T00:00:00.000Z');
    const t3 = new Date('2026-02-03T00:00:00.000Z');

    await db
      .update(schema.attempts)
      .set({ answeredAt: t1 })
      .where(eq(schema.attempts.id, aEasyIncorrect.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t2 })
      .where(eq(schema.attempts.id, aHardCorrect.id));
    await db
      .update(schema.attempts)
      .set({ answeredAt: t3 })
      .where(eq(schema.attempts.id, aHardIncorrect.id));

    const result = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { result: 'incorrect', difficulty: 'hard' },
    );

    expect(result.map((m) => m.questionId)).toEqual([qHardIncorrect.id]);

    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        result: 'incorrect',
        difficulty: 'hard',
      }),
    ).resolves.toBe(1);
  });

  it('uses id desc as deterministic tie-breaker for latest attempted-question semantics', async () => {
    const user = await createUser(db, cleanup);

    const qTie = await createQuestion(db, cleanup, {
      slug: `it-attempted-tie-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qIncorrect = await createQuestion(db, cleanup, {
      slug: `it-attempted-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const tieAnsweredAt = new Date('2026-02-06T00:00:00.000Z');
    const tieIncorrectId = '00000000-0000-4000-8000-000000000001';
    const tieCorrectId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

    await db.insert(schema.attempts).values([
      {
        id: tieIncorrectId,
        userId: user.id,
        questionId: qTie.id,
        practiceSessionId: null,
        selectedChoiceId: qTie.correctChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
      {
        id: tieCorrectId,
        userId: user.id,
        questionId: qTie.id,
        practiceSessionId: null,
        selectedChoiceId: qTie.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 1,
        answeredAt: tieAnsweredAt,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        userId: user.id,
        questionId: qIncorrect.id,
        practiceSessionId: null,
        selectedChoiceId: qIncorrect.correctChoiceId,
        isCorrect: false,
        timeSpentSeconds: 1,
        answeredAt: new Date('2026-02-05T00:00:00.000Z'),
      },
    ]);

    const attemptRepo = new DrizzleAttemptRepository(db);
    const attemptedIncorrect = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
      { result: 'incorrect' },
    );

    expect(attemptedIncorrect).toEqual([
      {
        questionId: qIncorrect.id,
        answeredAt: new Date('2026-02-05T00:00:00.000Z'),
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id, {
        result: 'incorrect',
      }),
    ).resolves.toBe(1);
  });
});
