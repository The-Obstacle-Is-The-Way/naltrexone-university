import { randomUUID } from 'node:crypto';
import {
  sql as drizzleSql,
  eq,
  inArray,
  like,
  TransactionRollbackError,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  activateRelease,
  assertNoActiveRelease,
  bootstrapRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import {
  buildReleaseManifest,
  releaseManifestHash,
} from '@/scripts/content-release/release-manifest';
import { archivePlaceholderQuestions } from '@/scripts/seed/placeholder-archiver';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';
import { source } from './seed-test-helpers';

type Db = PostgresJsDatabase<typeof schema>;

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// Activation archives every published question a release leaves out, and this
// database holds the seeded corpus. So each activation case runs in a
// transaction that is always rolled back.
async function withRollback(act: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await act(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

async function arrangeQuestion(status: schema.QuestionStatus) {
  return createQuestion(db, cleanup, {
    slug: `it-release-${randomUUID()}`,
    status,
    difficulty: 'easy',
  });
}

async function stateOf(tx: Db, questionIds: string[]) {
  const rows = await tx
    .select({
      id: schema.questions.id,
      status: schema.questions.status,
      currentRevisionId: schema.questions.currentRevisionId,
    })
    .from(schema.questions)
    .where(inArray(schema.questions.id, questionIds));
  return new Map(rows.map((row) => [row.id, row]));
}

async function pointerOf(tx: Db) {
  const [pointer] = await tx.select().from(schema.contentReleasePointer);
  return pointer;
}

// The messages along an error's cause chain: Drizzle wraps a database
// error, so the database's own message is the cause.
async function rejectionMessages(promise: Promise<unknown>): Promise<string> {
  let rejection: unknown;
  try {
    await promise;
  } catch (caught) {
    rejection = caught;
  }
  if (rejection === undefined) throw new Error('Expected a rejection');
  const messages: string[] = [];
  for (
    let current: unknown = rejection;
    current instanceof Error;
    current = current.cause
  ) {
    messages.push(current.message);
  }
  return messages.join(' <- ');
}

function item(question: { id: string; revisionId: string }) {
  return { questionId: question.id, questionRevisionId: question.revisionId };
}

async function withdraw(tx: Db, question: { id: string; revisionId: string }) {
  await tx.insert(schema.questionWithdrawals).values({
    ...item(question),
    reason: 'Unsafe dosing guidance',
    authority: 'Clinical lead',
  });
}

describe('DEBT-483: release activation', () => {
  it('publishes each item at its revision, archives a published question the release omits, and leaves drafts alone', async () => {
    const moved = await arrangeQuestion('published');
    await addCurrentRevision(db, moved.id);
    const restored = await arrangeQuestion('archived');
    const omitted = await arrangeQuestion('published');
    const draft = await arrangeQuestion('draft');

    await withRollback(async (tx) => {
      const releaseId = await stageRelease(tx, {
        items: [item(moved), item(restored)],
        parentReleaseId: null,
      });

      const summary = await activateRelease(tx, {
        releaseId,
        expectedActiveReleaseId: null,
      });

      const state = await stateOf(tx, [
        moved.id,
        restored.id,
        omitted.id,
        draft.id,
      ]);
      expect(state.get(moved.id)).toMatchObject({
        status: 'published',
        currentRevisionId: moved.revisionId,
      });
      expect(state.get(restored.id)?.status).toBe('published');
      expect(state.get(omitted.id)?.status).toBe('archived');
      expect(state.get(draft.id)?.status).toBe('draft');
      expect(summary).toMatchObject({
        releaseId,
        previousReleaseId: null,
        published: 2,
        excludedWithdrawn: 0,
        excludedHeld: 0,
      });
      expect(await pointerOf(tx)).toMatchObject({
        activeReleaseId: releaseId,
        activatedAt: expect.any(Date),
      });
      expect(
        await tx
          .select()
          .from(schema.contentReleaseActivations)
          .where(eq(schema.contentReleaseActivations.releaseId, releaseId)),
      ).toEqual([
        {
          id: expect.any(String),
          releaseId,
          previousReleaseId: null,
          activatedAt: expect.any(Date),
        },
      ]);
    });
  });

  it('never publishes a withdrawn question or a revision with an unlifted hold', async () => {
    const withdrawn = await arrangeQuestion('published');
    const held = await arrangeQuestion('published');
    const lifted = await arrangeQuestion('archived');

    await withRollback(async (tx) => {
      await withdraw(tx, withdrawn);
      await tx.insert(schema.questionHolds).values([
        { ...item(held), reason: 'Under review', authority: 'Clinical lead' },
        {
          ...item(lifted),
          reason: 'Under review',
          authority: 'Clinical lead',
          liftedAt: new Date(Date.now() + 1000),
        },
      ]);
      const releaseId = await stageRelease(tx, {
        items: [item(withdrawn), item(held), item(lifted)],
        parentReleaseId: null,
      });

      const summary = await activateRelease(tx, {
        releaseId,
        expectedActiveReleaseId: null,
      });

      const state = await stateOf(tx, [withdrawn.id, held.id, lifted.id]);
      expect(state.get(withdrawn.id)?.status).toBe('archived');
      expect(state.get(held.id)?.status).toBe('archived');
      expect(state.get(lifted.id)?.status).toBe('published');
      expect(summary).toMatchObject({ excludedWithdrawn: 1, excludedHeld: 1 });
    });
  });

  it('rolls back to an earlier release without resurrecting a withdrawn question', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const first = await stageRelease(tx, {
        items: [item(question)],
        parentReleaseId: null,
      });
      await activateRelease(tx, {
        releaseId: first,
        expectedActiveReleaseId: null,
      });
      const second = await stageRelease(tx, {
        items: [],
        parentReleaseId: first,
      });
      await activateRelease(tx, {
        releaseId: second,
        expectedActiveReleaseId: first,
      });
      await withdraw(tx, question);

      const summary = await activateRelease(tx, {
        releaseId: first,
        expectedActiveReleaseId: second,
      });

      expect((await stateOf(tx, [question.id])).get(question.id)?.status).toBe(
        'archived',
      );
      expect(summary).toMatchObject({
        previousReleaseId: second,
        excludedWithdrawn: 1,
      });
      expect((await pointerOf(tx))?.activeReleaseId).toBe(first);
    });
  });

  it('rejects a release when another release is active, changing nothing', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const first = await stageRelease(tx, {
        items: [item(question)],
        parentReleaseId: null,
      });
      const rival = await stageRelease(tx, {
        items: [],
        parentReleaseId: null,
      });
      await activateRelease(tx, {
        releaseId: first,
        expectedActiveReleaseId: null,
      });

      await expect(
        activateRelease(tx, {
          releaseId: rival,
          expectedActiveReleaseId: null,
        }),
      ).rejects.toMatchObject({ code: 'STALE_RELEASE' });

      expect((await pointerOf(tx))?.activeReleaseId).toBe(first);
      expect((await stateOf(tx, [question.id])).get(question.id)?.status).toBe(
        'published',
      );
    });
  });

  // ADR-021 §4: a new release must be built on the active one, or it would
  // silently drop whatever was activated since its base (#1293 review).
  it('rejects a new release built on an earlier release, even when the active release is named', async () => {
    const first = await arrangeQuestion('published');
    const second = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const base = await stageRelease(tx, {
        items: [item(first)],
        parentReleaseId: null,
      });
      await activateRelease(tx, {
        releaseId: base,
        expectedActiveReleaseId: null,
      });
      const outdated = await stageRelease(tx, {
        items: [],
        parentReleaseId: base,
      });
      const newer = await stageRelease(tx, {
        items: [item(first), item(second)],
        parentReleaseId: base,
      });
      await activateRelease(tx, {
        releaseId: newer,
        expectedActiveReleaseId: base,
      });

      await expect(
        activateRelease(tx, {
          releaseId: outdated,
          expectedActiveReleaseId: newer,
        }),
      ).rejects.toMatchObject({ code: 'STALE_RELEASE' });

      expect((await pointerOf(tx))?.activeReleaseId).toBe(newer);
      const state = await stateOf(tx, [first.id, second.id]);
      expect(state.get(first.id)?.status).toBe('published');
      expect(state.get(second.id)?.status).toBe('published');
    });
  });

  it('rejects a stored manifest that does not hash to its recorded hash', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const manifest = buildReleaseManifest([
        { slug: question.slug, contentHash: 'f'.repeat(64) },
      ]);
      const [release] = await tx
        .insert(schema.contentReleases)
        .values({
          manifest,
          manifestHash: releaseManifestHash(buildReleaseManifest([])),
        })
        .returning({ id: schema.contentReleases.id });
      const releaseId = release?.id ?? '';

      await expect(
        activateRelease(tx, { releaseId, expectedActiveReleaseId: null }),
      ).rejects.toMatchObject({ code: 'MANIFEST_HASH_MISMATCH' });
      expect((await pointerOf(tx))?.activeReleaseId).toBeNull();
    });
  });

  it('rejects items that do not match the manifest', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const manifest = buildReleaseManifest([
        { slug: question.slug, contentHash: 'f'.repeat(64) },
      ]);
      const [release] = await tx
        .insert(schema.contentReleases)
        .values({ manifest, manifestHash: releaseManifestHash(manifest) })
        .returning({ id: schema.contentReleases.id });
      const releaseId = release?.id ?? '';
      await tx
        .insert(schema.contentReleaseItems)
        .values({ releaseId, ...item(question) });

      await expect(
        activateRelease(tx, { releaseId, expectedActiveReleaseId: null }),
      ).rejects.toMatchObject({ code: 'MANIFEST_ITEMS_MISMATCH' });
      expect((await pointerOf(tx))?.activeReleaseId).toBeNull();
    });
  });

  it('leaves the previous state whole when its last write fails', async () => {
    const first = await arrangeQuestion('archived');
    const second = await arrangeQuestion('archived');

    await withRollback(async (tx) => {
      // The receipt is activation's last write, after the questions change.
      // The function and trigger exist only in this rolled-back transaction.
      await tx.execute(
        drizzleSql.raw(`CREATE FUNCTION it_fail_activation() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`),
      );
      await tx.execute(
        drizzleSql.raw(`CREATE TRIGGER it_fail_activation
          BEFORE INSERT ON content_release_activations
          FOR EACH ROW EXECUTE FUNCTION it_fail_activation()`),
      );
      const releaseId = await stageRelease(tx, {
        items: [item(first), item(second)],
        parentReleaseId: null,
      });

      expect(
        await rejectionMessages(
          activateRelease(tx, { releaseId, expectedActiveReleaseId: null }),
        ),
      ).toMatch(/injected failure/);

      const state = await stateOf(tx, [first.id, second.id]);
      expect(state.get(first.id)?.status).toBe('archived');
      expect(state.get(second.id)?.status).toBe('archived');
      expect(await pointerOf(tx)).toMatchObject({
        activeReleaseId: null,
        activatedAt: null,
      });
    });
  });

  it('rejects a release that does not exist', async () => {
    await withRollback(async (tx) => {
      await expect(
        activateRelease(tx, {
          releaseId: randomUUID(),
          expectedActiveReleaseId: null,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_NOT_FOUND' });
    });
  });

  it('bootstraps a release of what is live without changing any question', async () => {
    const published = await arrangeQuestion('published');
    const draft = await arrangeQuestion('draft');

    await withRollback(async (tx) => {
      const before = await tx
        .select({
          id: schema.questions.id,
          status: schema.questions.status,
          currentRevisionId: schema.questions.currentRevisionId,
        })
        .from(schema.questions)
        .orderBy(schema.questions.id);

      const summary = await bootstrapRelease(tx);

      expect(
        await tx
          .select({
            id: schema.questions.id,
            status: schema.questions.status,
            currentRevisionId: schema.questions.currentRevisionId,
          })
          .from(schema.questions)
          .orderBy(schema.questions.id),
      ).toEqual(before);
      expect(summary).toMatchObject({
        previousReleaseId: null,
        published: 0,
        archived: 0,
      });
      const items = await tx
        .select({ questionId: schema.contentReleaseItems.questionId })
        .from(schema.contentReleaseItems)
        .where(eq(schema.contentReleaseItems.releaseId, summary.releaseId));
      const itemIds = items.map((row) => row.questionId);
      expect(itemIds).toContain(published.id);
      expect(itemIds).not.toContain(draft.id);
      expect(itemIds).toHaveLength(
        before.filter((row) => row.status === 'published').length,
      );
      const [release] = await tx
        .select({ parentReleaseId: schema.contentReleases.parentReleaseId })
        .from(schema.contentReleases)
        .where(eq(schema.contentReleases.id, summary.releaseId));
      expect(release?.parentReleaseId).toBeNull();
    });
  });

  it('bootstraps only while no release is active', async () => {
    await withRollback(async (tx) => {
      await bootstrapRelease(tx);

      await expect(bootstrapRelease(tx)).rejects.toMatchObject({
        code: 'STALE_RELEASE',
      });
    });
  });

  it('keeps releases and their items immutable', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const releaseId = await stageRelease(tx, {
        items: [item(question)],
        parentReleaseId: null,
      });

      // Each attempt runs in a savepoint, so the outer transaction survives it.
      expect(
        await rejectionMessages(
          tx.transaction((sp) =>
            sp
              .update(schema.contentReleases)
              .set({ createdAt: new Date() })
              .where(eq(schema.contentReleases.id, releaseId)),
          ),
        ),
      ).toMatch(/content_releases rows are immutable/);
      expect(
        await rejectionMessages(
          tx.transaction((sp) =>
            sp
              .update(schema.contentReleaseItems)
              .set({ questionRevisionId: question.revisionId })
              .where(eq(schema.contentReleaseItems.releaseId, releaseId)),
          ),
        ),
      ).toMatch(/content_release_items rows are immutable/);
    });
  });

  it('keeps withdrawals immutable', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      await withdraw(tx, question);

      expect(
        await rejectionMessages(
          tx.transaction((sp) =>
            sp
              .update(schema.questionWithdrawals)
              .set({ reason: 'A rewritten reason' })
              .where(eq(schema.questionWithdrawals.questionId, question.id)),
          ),
        ),
      ).toMatch(/question_withdrawals rows are immutable/);
    });
  });

  it('lets a hold be lifted once and changes nothing else', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      await tx.insert(schema.questionHolds).values({
        ...item(question),
        reason: 'Under review',
        authority: 'Clinical lead',
      });
      const hold = eq(schema.questionHolds.questionId, question.id);

      await tx
        .update(schema.questionHolds)
        .set({ liftedAt: new Date(Date.now() + 1000) })
        .where(hold);

      for (const change of [
        { liftedAt: new Date(Date.now() + 2000) },
        { reason: 'A rewritten reason' },
      ]) {
        expect(
          await rejectionMessages(
            tx.transaction((sp) =>
              sp.update(schema.questionHolds).set(change).where(hold),
            ),
          ),
        ).toMatch(/a hold is only ever lifted, once/);
      }
    });
  });
});

describe('DEBT-483: the direct seed and an active release', () => {
  // Another connection must see the pointer, so these cases commit it. They
  // point it at a release of one test question, never activate it, and always
  // put the pointer back and delete the release.
  async function withActiveRelease(
    act: (releaseId: string) => Promise<void>,
  ): Promise<void> {
    const named = await arrangeQuestion('draft');
    const releaseId = await stageRelease(db, {
      items: [item(named)],
      parentReleaseId: null,
    });
    try {
      await db
        .update(schema.contentReleasePointer)
        .set({ activeReleaseId: releaseId, activatedAt: new Date() });
      await act(releaseId);
    } finally {
      await db
        .update(schema.contentReleasePointer)
        .set({ activeReleaseId: null, activatedAt: null });
      await db
        .delete(schema.contentReleases)
        .where(eq(schema.contentReleases.id, releaseId));
    }
  }

  it('refuses to sync an existing question', async () => {
    const question = await arrangeQuestion('published');

    await withActiveRelease(async (releaseId) => {
      await expect(
        syncQuestionsFromFiles(db, [
          source(question.slug, { stem: 'A rewritten clinical task.' }),
        ]),
      ).rejects.toThrow(new RegExp(`release ${releaseId} is active`));
    });

    expect(
      await db
        .select({ id: schema.questionRevisions.id })
        .from(schema.questionRevisions)
        .where(eq(schema.questionRevisions.questionId, question.id)),
    ).toHaveLength(1);
  });

  it('refuses to insert a new question', async () => {
    const slug = `it-release-${randomUUID()}`;
    const inserted = () =>
      db
        .select({ id: schema.questions.id })
        .from(schema.questions)
        .where(eq(schema.questions.slug, slug));

    try {
      await withActiveRelease(async () => {
        await expect(
          syncQuestionsFromFiles(db, [source(slug)]),
        ).rejects.toThrow(/is active/);
      });

      expect(await inserted()).toEqual([]);
    } finally {
      // Without the guard the seed would have inserted it.
      cleanup.questionIds.push(...(await inserted()).map((row) => row.id));
    }
  });

  it('refuses to archive placeholders', async () => {
    const placeholders = await db
      .select({ id: schema.questions.id, status: schema.questions.status })
      .from(schema.questions)
      .where(like(schema.questions.slug, 'placeholder-%'));

    try {
      await withActiveRelease(async () => {
        await expect(archivePlaceholderQuestions(db)).rejects.toThrow(
          /is active/,
        );
      });
    } finally {
      // Without the guard the archiver would have archived the fixtures.
      for (const { id, status } of placeholders) {
        await db
          .update(schema.questions)
          .set({ status })
          .where(eq(schema.questions.id, id));
      }
    }
  });

  it('still archives placeholders while no release is active', async () => {
    const placeholder = await createQuestion(db, cleanup, {
      slug: `placeholder-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    await withRollback(async (tx) => {
      await tx
        .update(schema.questions)
        .set({ status: 'published' })
        .where(like(schema.questions.slug, 'placeholder-%'));

      const archived = await archivePlaceholderQuestions(tx);

      const placeholders = await tx
        .select({ status: schema.questions.status })
        .from(schema.questions)
        .where(like(schema.questions.slug, 'placeholder-%'));
      expect(archived).toBe(placeholders.length);
      expect(placeholders.every((row) => row.status === 'archived')).toBe(true);
      expect(
        (await stateOf(tx, [placeholder.id])).get(placeholder.id)?.status,
      ).toBe('archived');
    });
  });

  it('waits for an activation in progress, then refuses', async () => {
    const question = await arrangeQuestion('published');
    const named = await arrangeQuestion('draft');
    const releaseId = await stageRelease(db, {
      items: [item(named)],
      parentReleaseId: null,
    });
    const { sql: activationSql } = createIntegrationDb();
    const { sql: monitorSql } = createIntegrationDb();
    const locked = Promise.withResolvers<number>();
    const release = Promise.withResolvers<void>();
    // Holds the pointer the way activation does, then commits it.
    const activation = activationSql.begin(async (tx) => {
      const [backend] = await tx<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid
      `;
      await tx`SELECT active_release_id FROM content_release_pointer FOR UPDATE`;
      await tx`UPDATE content_release_pointer SET active_release_id = ${releaseId}, activated_at = now()`;
      locked.resolve(backend?.pid ?? 0);
      await release.promise;
    });
    try {
      const pid = await locked.promise;
      const seed = syncQuestionsFromFiles(db, [
        source(question.slug, { stem: 'A rewritten clinical task.' }),
      ]);
      await expect
        .poll(async () => {
          const [row] = await monitorSql<{ blocked: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE ${pid} = ANY(pg_blocking_pids(pid))
            ) AS blocked
          `;
          return row?.blocked;
        })
        .toBe(true);
      release.resolve();
      await activation;

      await expect(seed).rejects.toThrow(/is active/);
    } finally {
      release.resolve();
      await Promise.allSettled([activation]);
      await db
        .update(schema.contentReleasePointer)
        .set({ activeReleaseId: null, activatedAt: null });
      await db
        .delete(schema.contentReleases)
        .where(eq(schema.contentReleases.id, releaseId));
      await Promise.allSettled([
        closeConnection(activationSql),
        closeConnection(monitorSql),
      ]);
    }
  });

  it('refuses when the pointer row is missing', async () => {
    await withRollback(async (tx) => {
      await tx.delete(schema.contentReleasePointer);

      await expect(assertNoActiveRelease(tx)).rejects.toThrow(
        /release pointer is missing/,
      );
    });
  });
});
