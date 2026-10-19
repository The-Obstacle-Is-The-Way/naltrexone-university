import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { runHoldQuestions } from '@/scripts/content-release/hold-questions';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { changeHolds } from '@/scripts/content-release/release-holds';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { answeredOutcome } from '@/src/domain/value-objects';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { createCleanupState, createUser } from './helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);
afterAll(async () => {
  await disposable.drop();
});
beforeEach(async () => {
  const { db } = disposable;
  await db
    .update(schema.contentReleasePointer)
    .set({ activeReleaseId: null, activatedAt: null });
  await db.delete(schema.contentReleaseActivations);
  await db.delete(schema.contentReleases);
  await db.delete(schema.questions);
  await db.delete(schema.users);
});

const decision = [
  '--reason',
  'Clinical review completed',
  '--authority',
  'Clinical lead',
];
const io = () => ({ env: { DATABASE_URL: disposable.url }, log: () => {} });

async function arrange(correctKey = false) {
  const { db } = disposable;
  const slug = `it-hold-scope-${randomUUID()}`;
  const kept = `it-hold-kept-${randomUUID()}`;
  await syncQuestionsFromFiles(db, [source(slug), source(kept)]);
  const [question] = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.slug, slug));
  if (!question?.currentRevisionId)
    throw new Error('Missing synthetic question');
  const [choice] = await db
    .select()
    .from(schema.choices)
    .where(eq(schema.choices.questionRevisionId, question.currentRevisionId));
  if (!choice) throw new Error('Missing synthetic choice');
  const user = await createUser(db, createCleanupState());
  const attempts = new DrizzleAttemptRepository(db);
  await attempts.insert({
    userId: user.id,
    questionId: question.id,
    questionRevisionId: question.currentRevisionId,
    practiceSessionId: null,
    outcome: answeredOutcome(choice.id),
    isCorrect: true,
    timeSpentSeconds: 1,
  });
  const base = (await bootstrapRelease(db, { record: RELEASE_DECISION }))
    .releaseId;
  await runHoldQuestions(['--qid', slug, ...decision, '--apply'], io());
  const [hold] = await db
    .select()
    .from(schema.questionHolds)
    .where(eq(schema.questionHolds.questionId, question.id));
  if (!hold) throw new Error('Missing synthetic hold');
  const next = await stageReleaseFromFiles(db, [
    source(
      slug,
      correctKey
        ? { correctText: 'Synthetic corrected key.' }
        : { stem: 'Synthetic editorial change.' },
    ),
    source(kept),
  ]);
  await activateRelease(db, {
    releaseId: next.releaseId,
    expectedActiveReleaseId: base,
    record: RELEASE_DECISION,
  });
  const read = async () => {
    const availability = await new DrizzleQuestionRepository(
      db,
    ).findAvailabilityByIds([question.id]);
    const score = await attempts.scoreByUserId(user.id, null);
    return { availability: availability.get(question.id), score };
  };
  return { slug, kept, question, hold, base, next: next.releaseId, read };
}

describe('revision holds and question availability', () => {
  it.each(['command', 'service'] as const)(
    'lifts a case-insensitive hold UUID through the %s boundary',
    async (boundary) => {
      const state = await arrange();
      const holdId = state.hold.id.toUpperCase();
      if (boundary === 'command') {
        await runHoldQuestions(
          ['--hold', holdId, '--lift', ...decision, '--apply'],
          io(),
        );
      } else {
        await changeHolds(disposable.db, {
          qids: [],
          holdIds: [holdId],
          lift: true,
          record: RELEASE_DECISION,
        });
      }
      const [hold] = await disposable.db
        .select()
        .from(schema.questionHolds)
        .where(eq(schema.questionHolds.id, state.hold.id));
      expect(hold?.liftedAt).toBeInstanceOf(Date);
      expect(await state.read()).toMatchObject({
        availability: 'available',
        score: { scored: 1 },
      });
    },
  );

  it('requires a named key return for a hold-ID lift and rolls back an unnamed lift', async () => {
    const state = await arrange(true);
    await activateRelease(disposable.db, {
      releaseId: state.base,
      expectedActiveReleaseId: state.next,
      record: RELEASE_DECISION,
    });
    const args = ['--hold', state.hold.id, '--lift', ...decision, '--apply'];
    const before = await disposable.db.select().from(schema.questions);

    await expect(runHoldQuestions(args, io())).rejects.toMatchObject({
      code: 'KEY_RETURN_REQUIRED',
    });

    const [hold] = await disposable.db
      .select()
      .from(schema.questionHolds)
      .where(eq(schema.questionHolds.id, state.hold.id));
    expect(hold?.liftedAt).toBeNull();
    expect(await disposable.db.select().from(schema.questions)).toEqual(before);
    await runHoldQuestions([...args, '--revert', state.slug], io());
    expect(await state.read()).toMatchObject({
      availability: 'available',
      score: { scored: 1 },
    });
  });

  it('lifts an old hold while its replacement stays live and never retargets a later hold', async () => {
    const state = await arrange();
    const args = ['--hold', state.hold.id, '--lift', ...decision, '--apply'];
    const before = await disposable.db.select().from(schema.questions);
    await runHoldQuestions(args, io());
    expect(await disposable.db.select().from(schema.questions)).toEqual(before);
    expect(await state.read()).toMatchObject({
      availability: 'available',
      score: { scored: 1 },
    });
    await activateRelease(disposable.db, {
      releaseId: state.base,
      expectedActiveReleaseId: state.next,
      record: RELEASE_DECISION,
    });
    await runHoldQuestions(['--qid', state.slug, ...decision, '--apply'], io());

    await runHoldQuestions(args, io());

    expect(await state.read()).toMatchObject({
      availability: 'under_review',
      score: { scored: 0 },
    });
    const holds = await disposable.db.select().from(schema.questionHolds);
    expect(holds.filter((hold) => hold.liftedAt === null)).toHaveLength(1);
    expect(
      holds.find((hold) => hold.id === state.hold.id)?.liftedAt,
    ).not.toBeNull();
  });

  it('lifts a named old hold after retirement without republishing or rewriting history', async () => {
    const { db } = disposable;
    const state = await arrange();
    expect(await state.read()).toMatchObject({
      availability: 'available',
      score: { scored: 1 },
    });
    const retired = await stageReleaseFromFiles(db, [
      source(state.slug, { status: 'draft' }),
      source(state.kept),
    ]);
    await activateRelease(db, {
      releaseId: retired.releaseId,
      expectedActiveReleaseId: state.next,
      record: RELEASE_DECISION,
    });
    expect(await state.read()).toMatchObject({
      availability: 'under_review',
      score: { scored: 0, unscoredQuestions: 1 },
    });
    const history = await db.select().from(schema.attempts);
    const revisions = await db.select().from(schema.questionRevisions);
    const args = ['--hold', state.hold.id, '--lift', ...decision];

    await runHoldQuestions(args, io());
    expect(await state.read()).toMatchObject({
      availability: 'under_review',
      score: { scored: 0 },
    });
    await runHoldQuestions([...args, '--apply'], io());

    expect(await state.read()).toMatchObject({
      availability: 'retired',
      score: { scored: 1, correct: 1 },
    });
    expect(await db.select().from(schema.attempts)).toEqual(history);
    expect(await db.select().from(schema.questionRevisions)).toEqual(revisions);
    const [hold] = await db
      .select()
      .from(schema.questionHolds)
      .where(eq(schema.questionHolds.id, state.hold.id));
    expect(hold).toMatchObject({
      liftedAt: expect.any(Date),
      liftReason: 'Clinical review completed',
      liftAuthority: 'Clinical lead',
    });
  });

  it('keeps an old revision held on rollback until its named hold is lifted', async () => {
    const state = await arrange();
    await activateRelease(disposable.db, {
      releaseId: state.base,
      expectedActiveReleaseId: state.next,
      record: RELEASE_DECISION,
    });
    expect(await state.read()).toMatchObject({
      availability: 'under_review',
      score: { scored: 0 },
    });

    await runHoldQuestions(
      ['--hold', state.hold.id, '--lift', ...decision, '--apply'],
      io(),
    );

    expect(await state.read()).toMatchObject({
      availability: 'available',
      score: { scored: 1 },
    });
    const [question] = await disposable.db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.id, state.question.id));
    expect(question?.currentRevisionId).toBe(state.question.currentRevisionId);
  });

  it('refuses an unknown named hold atomically and leaves another revision held', async () => {
    const state = await arrange();
    await runHoldQuestions(['--qid', state.slug, ...decision, '--apply'], io());
    const before = await disposable.db.select().from(schema.questionHolds);
    await expect(
      runHoldQuestions(
        [
          '--hold',
          state.hold.id,
          '--hold',
          randomUUID(),
          '--lift',
          ...decision,
          '--apply',
        ],
        io(),
      ),
    ).rejects.toThrow('Unknown hold ID');
    expect(await disposable.db.select().from(schema.questionHolds)).toEqual(
      before,
    );

    await runHoldQuestions(
      ['--hold', state.hold.id, '--lift', ...decision, '--apply'],
      io(),
    );
    expect(await state.read()).toMatchObject({
      availability: 'under_review',
      score: { scored: 0 },
    });
    const holds = await disposable.db.select().from(schema.questionHolds);
    expect(holds.filter((hold) => hold.liftedAt === null)).toHaveLength(1);
  });
});
