import { randomUUID } from 'node:crypto';
import {
  sql as drizzleSql,
  eq,
  inArray,
  TransactionRollbackError,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  activateRelease,
  bootstrapRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import {
  buildReleaseManifest,
  releaseManifestHash,
} from '@/scripts/content-release/release-manifest';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';

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
        record: RELEASE_DECISION,
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
          ...RELEASE_DECISION,
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
          liftReason: 'Reviewed; no error found',
          liftAuthority: 'Clinical lead',
        },
      ]);
      const releaseId = await stageRelease(tx, {
        items: [item(withdrawn), item(held), item(lifted)],
        parentReleaseId: null,
      });

      const summary = await activateRelease(tx, {
        record: RELEASE_DECISION,
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
        record: RELEASE_DECISION,
        releaseId: first,
        expectedActiveReleaseId: null,
      });
      const second = await stageRelease(tx, {
        items: [],
        removals: [{ questionId: question.id, kind: 'draft' }],
        parentReleaseId: first,
      });
      await activateRelease(tx, {
        record: RELEASE_DECISION,
        releaseId: second,
        expectedActiveReleaseId: first,
      });
      await withdraw(tx, question);

      const summary = await activateRelease(tx, {
        record: RELEASE_DECISION,
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
        record: RELEASE_DECISION,
        releaseId: first,
        expectedActiveReleaseId: null,
      });

      await expect(
        activateRelease(tx, {
          record: RELEASE_DECISION,
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
        record: RELEASE_DECISION,
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
        record: RELEASE_DECISION,
        releaseId: newer,
        expectedActiveReleaseId: base,
      });

      await expect(
        activateRelease(tx, {
          record: RELEASE_DECISION,
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

  // A release is its manifest on its base (migration 0048, #1295 review).
  it('keys a release by its manifest and its parent', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      const root = await stageRelease(tx, {
        items: [item(question)],
        parentReleaseId: null,
      });
      const base = await stageRelease(tx, { items: [], parentReleaseId: null });

      const rebased = await stageRelease(tx, {
        items: [item(question)],
        parentReleaseId: base,
      });

      expect(rebased).not.toBe(root);
      for (const [parentReleaseId, index] of [
        [null, 'content_releases_manifest_hash_root_uq'],
        [base, 'content_releases_manifest_hash_parent_uq'],
      ] as const) {
        expect(
          await rejectionMessages(
            tx.transaction((sp) =>
              stageRelease(sp, { items: [item(question)], parentReleaseId }),
            ),
          ),
        ).toContain(index);
      }
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
        activateRelease(tx, {
          record: RELEASE_DECISION,
          releaseId,
          expectedActiveReleaseId: null,
        }),
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
        activateRelease(tx, {
          record: RELEASE_DECISION,
          releaseId,
          expectedActiveReleaseId: null,
        }),
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
          activateRelease(tx, {
            record: RELEASE_DECISION,
            releaseId,
            expectedActiveReleaseId: null,
          }),
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
          record: RELEASE_DECISION,
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

      const summary = await bootstrapRelease(tx, {
        record: RELEASE_DECISION,
      });

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
      await bootstrapRelease(tx, {
        record: RELEASE_DECISION,
      });

      await expect(
        bootstrapRelease(tx, {
          record: RELEASE_DECISION,
        }),
      ).rejects.toMatchObject({
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

  it('lets a hold be lifted once, with its own record, and changes nothing else', async () => {
    const question = await arrangeQuestion('published');

    await withRollback(async (tx) => {
      await tx.insert(schema.questionHolds).values({
        ...item(question),
        reason: 'Under review',
        authority: 'Clinical lead',
      });
      const hold = eq(schema.questionHolds.questionId, question.id);
      // Lifting is a decision with its own record (migration 0048).
      expect(
        await rejectionMessages(
          tx.transaction((sp) =>
            sp
              .update(schema.questionHolds)
              .set({ liftedAt: new Date(Date.now() + 1000) })
              .where(hold),
          ),
        ),
      ).toMatch(/question_holds_lift_record_chk/);

      await tx
        .update(schema.questionHolds)
        .set({
          liftedAt: new Date(Date.now() + 1000),
          liftReason: 'Reviewed; no error found',
          liftAuthority: 'Clinical lead',
        })
        .where(hold);

      for (const change of [
        { liftedAt: new Date(Date.now() + 2000) },
        { reason: 'A rewritten reason' },
        { liftReason: 'A rewritten lift reason' },
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
