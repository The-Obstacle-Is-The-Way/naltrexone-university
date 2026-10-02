import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { runHoldQuestions } from '@/scripts/content-release/hold-questions';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { runContentWithdrawal } from '@/scripts/seed/withdraw-questions';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetAttemptedQuestionsUseCase } from '@/src/application/use-cases/get-attempted-questions';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { createCleanupState, createUser } from './helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

// DEBT-483's Verification, demonstrated on a disposable database: withdrawal,
// preserved attempts, no resurrection from stale output, rejection of stale
// releases, rollback with revocation checks, and no visible partial release
// after an injected failure. Each case drives the operator commands and the
// release engine the way an operator would.
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
  await db.delete(schema.attempts);
  await db.delete(schema.users);
  await db.delete(schema.questions);
});

const RECORD = [
  '--reason',
  'Unsafe dosing guidance',
  '--authority',
  'Clinical lead',
];
const io = () => ({ env: { DATABASE_URL: disposable.url }, log: () => {} });

function slug() {
  return `it-verify-${randomUUID()}`;
}

// Content as the direct seed writes it, before any release is active.
async function seedLive(...slugs: string[]) {
  await syncQuestionsFromFiles(
    disposable.db,
    slugs.map((qid) => source(qid)),
  );
}

async function withdraw(qid: string) {
  await runContentWithdrawal(['--qid', qid, ...RECORD, '--apply'], io());
}

async function stateOf(...qids: string[]) {
  const rows = await disposable.db
    .select({
      slug: schema.questions.slug,
      status: schema.questions.status,
      stemMd: schema.questionRevisions.stemMd,
    })
    .from(schema.questions)
    .innerJoin(
      schema.questionRevisions,
      eq(schema.questionRevisions.id, schema.questions.currentRevisionId),
    )
    .where(inArray(schema.questions.slug, qids));
  return Object.fromEntries(
    rows.map((row) => [row.slug, { status: row.status, stemMd: row.stemMd }]),
  );
}

async function activeRelease() {
  const [pointer] = await disposable.db
    .select({ id: schema.contentReleasePointer.activeReleaseId })
    .from(schema.contentReleasePointer);
  return pointer?.id ?? null;
}

describe('DEBT-483 Verification on a disposable database', () => {
  it('a withdrawal takes the question out at once and keeps it out of every later activation', async () => {
    const [withdrawn, kept] = [slug(), slug()];
    await seedLive(withdrawn, kept);
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;

    await withdraw(withdrawn);

    expect((await stateOf(withdrawn))[withdrawn]?.status).toBe('archived');
    // Re-applying the release that still names it does not bring it back.
    await expect(
      activateRelease(disposable.db, {
        record: RELEASE_DECISION,
        releaseId: base,
        expectedActiveReleaseId: base,
      }),
    ).resolves.toMatchObject({ excludedWithdrawn: 1, published: 0 });
    const next = await stageReleaseFromFiles(disposable.db, [
      source(withdrawn, { status: 'archived' }),
      source(kept),
    ]);
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: next.releaseId,
      expectedActiveReleaseId: base,
    });
    expect(await stateOf(withdrawn, kept)).toMatchObject({
      [withdrawn]: { status: 'archived' },
      [kept]: { status: 'published' },
    });
  });

  it("preserves a learner's attempt on a withdrawn question, and their review of it", async () => {
    const qid = slug();
    await seedLive(qid);
    const [question] = await disposable.db
      .select({
        id: schema.questions.id,
        revisionId: schema.questions.currentRevisionId,
      })
      .from(schema.questions)
      .where(eq(schema.questions.slug, qid));
    if (!question) throw new Error(`Seed did not write ${qid}`);
    const [correct] = await disposable.db
      .select({ id: schema.choices.id })
      .from(schema.choices)
      .where(
        and(
          eq(schema.choices.questionRevisionId, question.revisionId),
          eq(schema.choices.isCorrect, true),
        ),
      );
    const user = await createUser(disposable.db, createCleanupState());
    const attempts = new DrizzleAttemptRepository(disposable.db);
    await attempts.insert({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: question.revisionId,
      practiceSessionId: null,
      outcome: { kind: 'answered', selectedChoiceId: correct?.id ?? '' },
      isCorrect: true,
      timeSpentSeconds: 5,
    });
    const before = await disposable.db.select().from(schema.attempts);
    await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });

    await withdraw(qid);

    expect(await disposable.db.select().from(schema.attempts)).toEqual(before);
    const listed = await new GetAttemptedQuestionsUseCase(
      attempts,
      new DrizzleQuestionRepository(disposable.db),
      new FakeLogger(),
    ).execute({ userId: user.id, limit: 10, offset: 0 });
    expect(listed.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        withdrawn: true,
        questionId: question.id,
        stemMd: 'Original clinical task.',
      }),
    ]);
  });

  it('never resurrects a withdrawn question from stale output', async () => {
    const [withdrawn, other] = [slug(), slug()];
    await seedLive(withdrawn, other);
    await withdraw(withdrawn);

    // Before releases: the direct seed refuses the stale file.
    await expect(
      syncQuestionsFromFiles(disposable.db, [source(withdrawn)]),
    ).rejects.toThrow(/Refusing to reactivate archived question/);
    // After the bootstrap: staging refuses it too.
    await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    await expect(
      stageReleaseFromFiles(disposable.db, [source(withdrawn), source(other)]),
    ).rejects.toThrow(/Refusing to stage withdrawn question/);

    expect((await stateOf(withdrawn))[withdrawn]?.status).toBe('archived');
  });

  it('rejects a release staged on a base that is no longer active', async () => {
    const [first, second] = [slug(), slug()];
    await seedLive(first, second);
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    const outdated = await stageReleaseFromFiles(disposable.db, [
      source(first, { stem: 'An outdated correction.' }),
      source(second),
    ]);
    const newer = await stageReleaseFromFiles(disposable.db, [
      source(first),
      source(second, { stem: 'A newer correction.' }),
    ]);
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: newer.releaseId,
      expectedActiveReleaseId: base,
    });

    await expect(
      activateRelease(disposable.db, {
        record: RELEASE_DECISION,
        releaseId: outdated.releaseId,
        expectedActiveReleaseId: newer.releaseId,
      }),
    ).rejects.toMatchObject({ code: 'STALE_RELEASE' });

    expect(await activeRelease()).toBe(newer.releaseId);
    expect(await stateOf(first, second)).toMatchObject({
      [first]: { stemMd: 'Original clinical task.' },
      [second]: { stemMd: 'A newer correction.' },
    });
  });

  it('rolls back with the overlay applied: a withdrawn question and a held revision stay out', async () => {
    const [withdrawn, held] = [slug(), slug()];
    await seedLive(withdrawn, held);
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    await runHoldQuestions(['--qid', held, ...RECORD, '--apply'], io());
    const corrected = await stageReleaseFromFiles(disposable.db, [
      source(withdrawn, { stem: 'A corrected task.' }),
      source(held, { stem: 'A corrected task.' }),
    ]);
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: corrected.releaseId,
      expectedActiveReleaseId: base,
    });
    // The corrected revision is not held, so it is live.
    expect((await stateOf(held))[held]?.status).toBe('published');
    await withdraw(withdrawn);

    const rollback = await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: base,
      expectedActiveReleaseId: corrected.releaseId,
    });

    expect(rollback).toMatchObject({ excludedWithdrawn: 1, excludedHeld: 1 });
    expect(await stateOf(withdrawn, held)).toMatchObject({
      [withdrawn]: { status: 'archived' },
      [held]: { status: 'archived' },
    });
    expect(await activeRelease()).toBe(base);
  });

  // A reader on another connection sees an activation whole or not at all.
  // A trigger pauses the activation at its last write, after every question
  // has changed, until the test releases an advisory lock; then it fails or
  // goes on to commit.
  it.each([
    ['fails', true],
    ['commits', false],
    ['observation fails', false],
  ])('shows a reader no part of an activation that %s', async (_name, fail) => {
    const [changed, dropped, added] = [slug(), slug(), slug()];
    await seedLive(changed, dropped);
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    const next = await stageReleaseFromFiles(disposable.db, [
      source(changed, { stem: 'A corrected task.' }),
      source(dropped, { status: 'draft' }),
      source(added),
    ]);
    const lockKey = 483;
    const holder = postgres(disposable.url, { max: 1, onnotice: () => {} });
    const activator = postgres(disposable.url, { max: 1, onnotice: () => {} });
    const observationFailure = new Error('injected observation failure');
    let observedFailure: unknown;
    let settled: Promise<unknown> | undefined;
    try {
      const [backend] = await activator<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      if (!backend) throw new Error('Activation backend is missing');
      await disposable.db.execute(
        `CREATE FUNCTION it_pause_activation() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         PERFORM pg_advisory_lock(${lockKey});
         PERFORM pg_advisory_unlock(${lockKey});
         ${fail ? "RAISE EXCEPTION 'injected failure';" : ''}
         RETURN NEW;
       END $$`,
      );
      await disposable.db.execute(
        `CREATE TRIGGER it_pause_activation BEFORE INSERT ON content_release_activations
       FOR EACH ROW EXECUTE FUNCTION it_pause_activation()`,
      );
      const before = {
        [changed]: { status: 'published', stemMd: 'Original clinical task.' },
        [dropped]: { status: 'published', stemMd: 'Original clinical task.' },
        [added]: { status: 'draft', stemMd: 'Original clinical task.' },
      };
      await holder`SELECT pg_advisory_lock(${lockKey})`;
      const activation = activateRelease(drizzle(activator, { schema }), {
        releaseId: next.releaseId,
        expectedActiveReleaseId: base,
        record: RELEASE_DECISION,
      });
      settled = activation.then(
        () => 'committed',
        (error: unknown) => error,
      );
      await expect
        .poll(async () => {
          const [row] = await holder<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_locks
              WHERE pid = ${backend.pid}
                AND locktype = 'advisory' AND objid = ${lockKey}
                AND NOT granted
            ) AS waiting
          `;
          return row?.waiting;
        })
        .toBe(true);

      if (_name === 'observation fails') throw observationFailure;

      // Paused after every question changed: the reader sees none of it.
      expect(await stateOf(changed, dropped, added)).toEqual(before);
      expect(await activeRelease()).toBe(base);

      await holder`SELECT pg_advisory_unlock(${lockKey})`;
      const outcome = await settled;

      if (fail) {
        // Drizzle wraps the database error; its own message is the cause.
        expect(outcome).toMatchObject({
          cause: expect.objectContaining({
            message: expect.stringMatching(/injected failure/),
          }),
        });
        expect(await stateOf(changed, dropped, added)).toEqual(before);
        expect(await activeRelease()).toBe(base);
      } else {
        expect(outcome).toBe('committed');
        expect(await stateOf(changed, dropped, added)).toEqual({
          [changed]: { status: 'published', stemMd: 'A corrected task.' },
          [dropped]: { status: 'archived', stemMd: 'Original clinical task.' },
          [added]: { status: 'published', stemMd: 'Original clinical task.' },
        });
        expect(await activeRelease()).toBe(next.releaseId);
      }
    } catch (error) {
      if (_name !== 'observation fails') throw error;
      observedFailure = error;
    } finally {
      try {
        await holder`SELECT pg_advisory_unlock_all()`;
        await settled;
        await disposable.db.execute(
          'DROP TRIGGER IF EXISTS it_pause_activation ON content_release_activations',
        );
        await disposable.db.execute(
          'DROP FUNCTION IF EXISTS it_pause_activation()',
        );
      } finally {
        await Promise.allSettled([
          holder.end({ timeout: 5 }),
          activator.end({ timeout: 5 }),
        ]);
      }
    }
    if (_name === 'observation fails')
      expect(observedFailure).toBe(observationFailure);
  });
});
