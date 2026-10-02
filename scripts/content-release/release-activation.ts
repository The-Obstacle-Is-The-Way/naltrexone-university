import { eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { onlyRow } from '../seed/only-row';
import {
  buildReleaseManifest,
  parseReleaseManifest,
  releaseManifestHash,
} from './release-manifest';

type Db = PostgresJsDatabase<typeof schema>;

export type ReleaseItem = { questionId: string; questionRevisionId: string };

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
};

export type ReleaseActivationErrorCode =
  | 'POINTER_MISSING'
  | 'RELEASE_ACTIVE'
  | 'NO_ACTIVE_RELEASE'
  | 'STALE_RELEASE'
  | 'RELEASE_NOT_FOUND'
  | 'MANIFEST_HASH_MISMATCH'
  | 'MANIFEST_ITEMS_MISMATCH';

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
const ELIGIBLE = sql`NOT ${WITHDRAWN} AND NOT ${HELD}`;

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
  input: { items: readonly ReleaseItem[]; parentReleaseId: string | null },
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
    const manifest = buildReleaseManifest(entries);
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
// blocking learner attempt foreign-key KEY SHARE locks (BUG-314).
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
    ORDER BY id
    FOR NO KEY UPDATE
  `);
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
  input: { releaseId: string; expectedActiveReleaseId: string | null },
): Promise<ActivationSummary> {
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
    if (release.parentReleaseId !== previousReleaseId) {
      const [earlier] = await tx
        .select({ id: schema.contentReleaseActivations.id })
        .from(schema.contentReleaseActivations)
        .where(eq(schema.contentReleaseActivations.releaseId, release.id))
        .limit(1);
      if (!earlier) {
        throw new ReleaseActivationError(
          'STALE_RELEASE',
          `Release ${release.id} is built on ${release.parentReleaseId ?? 'none'}, but ${previousReleaseId ?? 'none'} is active.`,
        );
      }
    }
    const manifestHash = releaseManifestHash(
      parseReleaseManifest(release.manifest),
    );
    if (manifestHash !== release.manifestHash) {
      throw new ReleaseActivationError(
        'MANIFEST_HASH_MISMATCH',
        `Release ${release.id}'s manifest does not hash to its recorded hash.`,
      );
    }
    const entries = await releaseEntries(tx, release.id);
    const itemsHash = releaseManifestHash(buildReleaseManifest(entries));
    if (itemsHash !== manifestHash) {
      throw new ReleaseActivationError(
        'MANIFEST_ITEMS_MISMATCH',
        `Release ${release.id}'s items do not match its manifest.`,
      );
    }

    // 3. Lock every question this changes, in id order: the order the seed
    // and the withdrawal command lock them.
    await lockActivationQuestions(tx, release.id);

    // 4. Materialize. Drafts no release names are left as they are.
    const excluded = onlyRow(
      await tx.execute<{ withdrawn: number; held: number }>(sql`
        SELECT
          count(*) FILTER (WHERE ${WITHDRAWN})::int AS withdrawn,
          count(*) FILTER (WHERE NOT ${WITHDRAWN} AND ${HELD})::int AS held
        FROM content_release_items i
        WHERE i.release_id = ${release.id}
      `),
      'Failed to count the excluded items',
    );
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
    await tx
      .insert(schema.contentReleaseActivations)
      .values({ releaseId: release.id, previousReleaseId });

    return {
      releaseId: release.id,
      previousReleaseId,
      items: entries.length,
      published: published.length,
      archived: archived.length,
      excludedWithdrawn: excluded.withdrawn,
      excludedHeld: excluded.held,
    };
  });
}

// The first activation adopts what is live: every published question at its
// current revision, with no parent. It holds the pointer before reading, so
// no seed transaction publishes in between.
export async function bootstrapRelease(db: Db): Promise<ActivationSummary> {
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
    return activateRelease(tx, { releaseId, expectedActiveReleaseId: null });
  });
}
