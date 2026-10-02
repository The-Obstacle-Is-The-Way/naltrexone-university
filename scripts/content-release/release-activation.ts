import { createHash } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { onlyRow } from '../seed/only-row';
import type { DecisionRecord } from '../seed/qid-command-args';
import {
  findUnrecordedWithdrawals,
  recordWithdrawals,
} from '../seed/question-withdrawal-writer';
import {
  buildReleaseManifest,
  parseReleaseManifest,
  type ReleaseRemovalKind,
  releaseManifestHash,
} from './release-manifest';

type Db = PostgresJsDatabase<typeof schema>;

export type ReleaseItem = { questionId: string; questionRevisionId: string };

// DEBT-489: a live question the release leaves out, and why.
export type ReleaseRemoval = { questionId: string; kind: ReleaseRemovalKind };

export type ActivationSummary = {
  releaseId: string;
  previousReleaseId: string | null;
  /** Items in the release. */
  items: number;
  /** Questions published, or moved to their item's revision. */
  published: number;
  /** Published questions the release leaves out or excludes. */
  archived: number;
  /** Items whose question has a withdrawal. */
  excludedWithdrawn: number;
  /** Items, not withdrawn, whose revision has an unlifted hold. */
  excludedHeld: number;
  /** Questions the release's `archived` removals withdrew. */
  withdrawn: number;
  plan: ActivationPlan;
};

// DEBT-489: the activation's plan, computed under its locks. The id binds
// the release, named by its identity (its manifest hash and parent, unique
// by migration 0048), the release it replaces, every (question, revision) it
// publishes, every question it archives and every question it withdraws, so
// an apply can be held to exactly the preview an operator reviewed. Naming
// the release by identity rather than by row id lets a bootstrap, whose
// release is created in the same transaction, be previewed and then applied
// to the same plan. The slug lists are that diff, named.
export type ActivationPlan = {
  id: string;
  /** Questions that leave the bank. */
  archive: string[];
  /** Questions published, or moved to another revision. */
  changed: string[];
  /** Questions withdrawn for good. */
  withdraw: string[];
  /** Items left out because their revision has an unlifted hold. */
  excludedHeld: string[];
  /** Items left out because their question is withdrawn. */
  excludedWithdrawn: string[];
};

export type ReleaseActivationErrorCode =
  | 'POINTER_MISSING'
  | 'RELEASE_ACTIVE'
  | 'NO_ACTIVE_RELEASE'
  | 'STALE_RELEASE'
  | 'RELEASE_NOT_FOUND'
  | 'MANIFEST_HASH_MISMATCH'
  | 'MANIFEST_ITEMS_MISMATCH'
  | 'INCOMPLETE_RELEASE'
  | 'PLAN_MISMATCH'
  | 'DECISION_REQUIRED';

export class ReleaseActivationError extends Error {
  constructor(
    readonly code: ReleaseActivationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReleaseActivationError';
  }
}

// An item is selectable unless its question has a withdrawal, which is
// permanent and per question (#953), or its revision has an unlifted hold.
// Used inside statements that alias content_release_items as i.
const WITHDRAWN = sql`EXISTS (
  SELECT 1 FROM question_withdrawals w WHERE w.question_id = i.question_id
)`;
const HELD = sql`EXISTS (
  SELECT 1 FROM question_holds h
  WHERE h.question_revision_id = i.question_revision_id AND h.lifted_at IS NULL
)`;
// Parenthesized, so it negates and combines as one condition.
const ELIGIBLE = sql`(NOT ${WITHDRAWN} AND NOT ${HELD})`;

// All supported content writers acquire this lock before any question row.
// Serializing these operator transactions also covers nested hold activation
// and concurrent staging of questions that do not exist yet (BUG-314).
export async function lockReleasePointer(tx: Db): Promise<string | null> {
  const [pointer] = await tx
    .select({ activeReleaseId: schema.contentReleasePointer.activeReleaseId })
    .from(schema.contentReleasePointer)
    .for('update');
  if (!pointer) {
    throw new ReleaseActivationError(
      'POINTER_MISSING',
      'The content release pointer is missing; migration 0047 creates it, so this database is not fully migrated.',
    );
  }
  return pointer.activeReleaseId;
}

// DEBT-483 phase 4: once a release is active, only activation and the
// withdrawal command write questions.status. The direct seed calls this first
// in each transaction. Its exclusive pointer lock serializes it with every
// other supported content writer before any question row is locked.
export async function assertNoActiveRelease(tx: Db): Promise<void> {
  const active = await lockReleasePointer(tx);
  if (active !== null) {
    throw new ReleaseActivationError(
      'RELEASE_ACTIVE',
      `Refusing to seed directly: release ${active} is active, so content changes only through releases.`,
    );
  }
}

async function releaseEntries(tx: Db, releaseId: string) {
  return tx
    .select({
      slug: schema.questions.slug,
      contentHash: schema.questionRevisions.contentHash,
    })
    .from(schema.contentReleaseItems)
    .innerJoin(
      schema.questions,
      eq(schema.questions.id, schema.contentReleaseItems.questionId),
    )
    .innerJoin(
      schema.questionRevisions,
      eq(
        schema.questionRevisions.id,
        schema.contentReleaseItems.questionRevisionId,
      ),
    )
    .where(eq(schema.contentReleaseItems.releaseId, releaseId));
}

// Writes a release of the given items, invisibly: nothing reads a release
// until it is activated. Its manifest names each item's slug and the content
// hash of the item's revision.
export async function stageRelease(
  db: Db,
  input: {
    items: readonly ReleaseItem[];
    removals?: readonly ReleaseRemoval[];
    parentReleaseId: string | null;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const entries =
      input.items.length === 0
        ? []
        : await tx
            .select({
              slug: schema.questions.slug,
              contentHash: schema.questionRevisions.contentHash,
            })
            .from(schema.questionRevisions)
            .innerJoin(
              schema.questions,
              eq(schema.questions.id, schema.questionRevisions.questionId),
            )
            .where(
              inArray(
                schema.questionRevisions.id,
                input.items.map((item) => item.questionRevisionId),
              ),
            );
    const removals = input.removals ?? [];
    const removedSlugs = await tx
      .select({ id: schema.questions.id, slug: schema.questions.slug })
      .from(schema.questions)
      .where(
        inArray(
          schema.questions.id,
          removals.map((removal) => removal.questionId),
        ),
      );
    const slugById = new Map(removedSlugs.map((row) => [row.id, row.slug]));
    const manifest = buildReleaseManifest(
      entries,
      removals.map((removal) => {
        const slug = slugById.get(removal.questionId);
        if (slug === undefined) {
          throw new Error(
            `A removal names ${removal.questionId}, which is not a question`,
          );
        }
        return { slug, kind: removal.kind };
      }),
    );
    const release = onlyRow(
      await tx
        .insert(schema.contentReleases)
        .values({
          manifest,
          manifestHash: releaseManifestHash(manifest),
          parentReleaseId: input.parentReleaseId,
        })
        .returning({ id: schema.contentReleases.id }),
      'Failed to stage the release',
    );
    if (input.items.length > 0) {
      await tx
        .insert(schema.contentReleaseItems)
        .values(
          input.items.map((item) => ({ releaseId: release.id, ...item })),
        );
    }
    return release.id;
  });
}

// A hold defers its question locks to this full, ordered activation set.
// NO KEY UPDATE protects status/revision writes without
// blocking learner attempt foreign-key KEY SHARE locks (BUG-314). The set
// includes the release's named removals, which activation may withdraw
// (DEBT-489).
async function lockActivationQuestions(
  tx: Db,
  releaseId: string,
): Promise<void> {
  await tx.execute(sql`
    SELECT id FROM questions
    WHERE status = 'published'
      OR id IN (
        SELECT question_id FROM content_release_items
        WHERE release_id = ${releaseId}
      )
      OR slug IN (
        SELECT jsonb_array_elements(manifest -> 'removals') ->> 'slug'
        FROM content_releases WHERE id = ${releaseId}
      )
    ORDER BY id
    FOR NO KEY UPDATE
  `);
}

// DEBT-490: an activation is a decision, so it names why and on whose
// authority, as a withdrawal or a hold does. Checked before anything is
// locked or written; the database refuses a blank one too (migration 0049).
function assertDecision(record: DecisionRecord): void {
  const blank = (['reason', 'authority'] as const).find(
    (field) => !/\S/.test(record[field]),
  );
  if (blank !== undefined) {
    throw new ReleaseActivationError(
      'DECISION_REQUIRED',
      `An activation needs a ${blank}: why it is made, and on whose authority.`,
    );
  }
}

// ADR-021 decision 4: activation is one transaction. It checks that the
// active release is the one the caller expects and, for a release never
// active before, the release's parent; verifies the release; then
// materializes questions.status and current_revision_id from the release
// minus the overlay, and moves the pointer. Any failure leaves the previous
// release active and every question as it was. A rollback is the activation
// of an earlier release, so the overlay applies to it too.
export async function activateRelease(
  db: Db,
  input: {
    releaseId: string;
    expectedActiveReleaseId: string | null;
    /** The plan id an operator reviewed; a different plan applies nothing. */
    expectedPlanId?: string | undefined;
    /** Why, and on whose authority: kept on the receipt (DEBT-490). */
    record: DecisionRecord;
  },
): Promise<ActivationSummary> {
  assertDecision(input.record);
  return db.transaction(async (tx) => {
    // 1. The pointer first: every content writer takes it first.
    const previousReleaseId = await lockReleasePointer(tx);
    if (previousReleaseId !== input.expectedActiveReleaseId) {
      throw new ReleaseActivationError(
        'STALE_RELEASE',
        `Release ${previousReleaseId ?? 'none'} is active, not ${input.expectedActiveReleaseId ?? 'none'} as expected.`,
      );
    }

    // 2. Verify the manifest against its hash, and the items against it.
    const [release] = await tx
      .select()
      .from(schema.contentReleases)
      .where(eq(schema.contentReleases.id, input.releaseId));
    if (!release) {
      throw new ReleaseActivationError(
        'RELEASE_NOT_FOUND',
        `Release ${input.releaseId} does not exist.`,
      );
    }
    // A release never active before must be built on the active release, or
    // it would drop whatever was activated since its base (ADR-021 §4). A
    // rollback re-activates a release that was active before, so its parent
    // is history, not a base.
    const [earlier] = await tx
      .select({ id: schema.contentReleaseActivations.id })
      .from(schema.contentReleaseActivations)
      .where(eq(schema.contentReleaseActivations.releaseId, release.id))
      .limit(1);
    const isRollback = earlier !== undefined;
    if (!isRollback && release.parentReleaseId !== previousReleaseId) {
      throw new ReleaseActivationError(
        'STALE_RELEASE',
        `Release ${release.id} is built on ${release.parentReleaseId ?? 'none'}, but ${previousReleaseId ?? 'none'} is active.`,
      );
    }
    const manifest = parseReleaseManifest(release.manifest);
    const manifestHash = releaseManifestHash(manifest);
    if (manifestHash !== release.manifestHash) {
      throw new ReleaseActivationError(
        'MANIFEST_HASH_MISMATCH',
        `Release ${release.id}'s manifest does not hash to its recorded hash.`,
      );
    }
    const entries = await releaseEntries(tx, release.id);
    const itemsHash = releaseManifestHash(
      buildReleaseManifest(entries, manifest.removals),
    );
    // In id order, so the plan's withdrawals are, like its other sets.
    const removed = await tx
      .select({ id: schema.questions.id, slug: schema.questions.slug })
      .from(schema.questions)
      .where(
        inArray(
          schema.questions.slug,
          manifest.removals.map((removal) => removal.slug),
        ),
      )
      .orderBy(asc(schema.questions.id));
    if (
      itemsHash !== manifestHash ||
      removed.length !== manifest.removals.length
    ) {
      throw new ReleaseActivationError(
        'MANIFEST_ITEMS_MISMATCH',
        `Release ${release.id}'s items do not match its manifest.`,
      );
    }

    // 3. Lock every question this changes, in id order: the order the seed
    // and the withdrawal command lock them.
    await lockActivationQuestions(tx, release.id);

    // DEBT-489: a new release accounts for every member of the active
    // release, as an item, a named removal, or a question already withdrawn.
    // Absence alone never removes a question. A rollback restores a snapshot
    // that was live, so it is exempt. Every exclusion is NOT EXISTS, never
    // NOT IN, so a NULL cannot make the check pass silently.
    if (!isRollback && previousReleaseId !== null) {
      const unaccounted = await tx.execute<{ slug: string }>(sql`
        SELECT q.slug FROM content_release_items member
        JOIN questions q ON q.id = member.question_id
        WHERE member.release_id = ${previousReleaseId}
          AND NOT EXISTS (
            SELECT 1 FROM content_release_items i
            WHERE i.release_id = ${release.id} AND i.question_id = member.question_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM question_withdrawals w
            WHERE w.question_id = member.question_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM content_releases r,
              jsonb_array_elements(r.manifest -> 'removals') AS removal
            WHERE r.id = ${release.id} AND removal ->> 'slug' = q.slug
          )
        ORDER BY q.slug
      `);
      if (unaccounted.length > 0) {
        throw new ReleaseActivationError(
          'INCOMPLETE_RELEASE',
          `Release ${release.id} leaves out live questions it does not name as removals: ${unaccounted.map((row) => row.slug).join(', ')}.`,
        );
      }
    }

    // An `archived` removal is a permanent withdrawal, made here and not at
    // staging, so an abandoned release leaves nothing behind. Its record
    // names the release, whose manifest is the authored decision.
    const archivedSlugs = new Set(
      manifest.removals
        .filter((removal) => removal.kind === 'archived')
        .map((removal) => removal.slug),
    );
    const unrecorded = await findUnrecordedWithdrawals(
      tx,
      removed.filter((row) => archivedSlugs.has(row.slug)).map((row) => row.id),
    );
    await recordWithdrawals(tx, unrecorded, {
      reason: `archived in content release ${release.id}: ${input.record.reason}`,
      authority: input.record.authority,
    });
    const withdrawnIds = new Set(unrecorded.map((row) => row.questionId));
    const withdrawn = withdrawnIds.size;

    // The plan: what the statements below will do, under the same locks.
    const publishing = await tx.execute<{
      question_id: string;
      question_revision_id: string;
      slug: string;
      changed: boolean;
    }>(sql`
      SELECT i.question_id, i.question_revision_id, q.slug,
        (q.status <> 'published'
          OR q.current_revision_id <> i.question_revision_id) AS changed
      FROM content_release_items i
      JOIN questions q ON q.id = i.question_id
      WHERE i.release_id = ${release.id} AND ${ELIGIBLE}
      ORDER BY i.question_id
    `);
    const archiving = await tx.execute<{ id: string; slug: string }>(sql`
      SELECT q.id, q.slug FROM questions q
      WHERE q.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM content_release_items i
          WHERE i.release_id = ${release.id}
            AND i.question_id = q.id
            AND ${ELIGIBLE}
        )
      ORDER BY q.id
    `);
    const withdrawing = removed.filter((row) => withdrawnIds.has(row.id));
    const planId = createHash('sha256')
      .update(
        JSON.stringify({
          manifest: release.manifestHash,
          parent: release.parentReleaseId,
          previous: previousReleaseId,
          publish: publishing.map((row) => [
            row.question_id,
            row.question_revision_id,
          ]),
          archive: archiving.map((row) => row.id),
          withdraw: withdrawing.map((row) => row.id),
        }),
      )
      .digest('hex');
    if (input.expectedPlanId !== undefined && input.expectedPlanId !== planId) {
      throw new ReleaseActivationError(
        'PLAN_MISMATCH',
        `Release ${release.id}'s plan is now ${planId}, not ${input.expectedPlanId} as reviewed. Nothing was applied; preview it again.`,
      );
    }
    // The items the overlay leaves out, which the publish set already binds.
    const excluded = await tx.execute<{ slug: string; withdrawn: boolean }>(sql`
      SELECT q.slug, ${WITHDRAWN} AS withdrawn
      FROM content_release_items i
      JOIN questions q ON q.id = i.question_id
      WHERE i.release_id = ${release.id} AND NOT ${ELIGIBLE}
    `);
    const bySlug = (rows: readonly { slug: string }[]) =>
      rows.map((row) => row.slug).sort();
    const plan: ActivationPlan = {
      id: planId,
      archive: bySlug(archiving),
      changed: bySlug(publishing.filter((row) => row.changed)),
      withdraw: bySlug(withdrawing),
      excludedHeld: bySlug(excluded.filter((row) => !row.withdrawn)),
      excludedWithdrawn: bySlug(excluded.filter((row) => row.withdrawn)),
    };

    // 4. Materialize. Drafts no release names are left as they are.
    const published = await tx.execute(sql`
      UPDATE questions q
      SET status = 'published',
        current_revision_id = i.question_revision_id,
        updated_at = now()
      FROM content_release_items i
      WHERE i.release_id = ${release.id}
        AND q.id = i.question_id
        AND ${ELIGIBLE}
        AND (q.status <> 'published'
          OR q.current_revision_id <> i.question_revision_id)
      RETURNING q.id
    `);
    const archived = await tx.execute(sql`
      UPDATE questions q
      SET status = 'archived', updated_at = now()
      WHERE q.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM content_release_items i
          WHERE i.release_id = ${release.id}
            AND i.question_id = q.id
            AND ${ELIGIBLE}
        )
      RETURNING q.id
    `);

    // 5. Move the pointer and keep the receipt.
    await tx
      .update(schema.contentReleasePointer)
      .set({ activeReleaseId: release.id, activatedAt: sql`now()` });
    await tx.insert(schema.contentReleaseActivations).values({
      releaseId: release.id,
      previousReleaseId,
      reason: input.record.reason,
      authority: input.record.authority,
    });

    return {
      releaseId: release.id,
      previousReleaseId,
      items: entries.length,
      published: published.length,
      archived: archived.length,
      excludedWithdrawn: plan.excludedWithdrawn.length,
      excludedHeld: plan.excludedHeld.length,
      withdrawn,
      plan,
    };
  });
}

// The first activation adopts what is live: every published question at its
// current revision, with no parent. It holds the pointer before reading, so
// no seed transaction publishes in between. Given the plan id its preview
// printed, it adopts nothing if what is live has changed since (DEBT-489).
export async function bootstrapRelease(
  db: Db,
  input: { expectedPlanId?: string | undefined; record: DecisionRecord },
): Promise<ActivationSummary> {
  assertDecision(input.record);
  return db.transaction(async (tx) => {
    const active = await lockReleasePointer(tx);
    if (active !== null) {
      throw new ReleaseActivationError(
        'STALE_RELEASE',
        `Release ${active} is active; only the first release adopts what is live.`,
      );
    }
    const live = await tx
      .select({
        questionId: schema.questions.id,
        questionRevisionId: schema.questions.currentRevisionId,
      })
      .from(schema.questions)
      .where(eq(schema.questions.status, 'published'));
    const releaseId = await stageRelease(tx, {
      items: live,
      parentReleaseId: null,
    });
    return activateRelease(tx, {
      releaseId,
      expectedActiveReleaseId: null,
      expectedPlanId: input.expectedPlanId,
      record: input.record,
    });
  });
}
