import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { sha256Hex } from '../../lib/content/parse-mdx-question';
import { questionRevisionContentHash } from '../../lib/content/question-revision-hash';
import type { SeedSourceFile } from '../seed/file-reader';
import { onlyRow } from '../seed/only-row';
import {
  revisionFieldsFromSeed,
  type SeedQuestionRep,
} from '../seed/question-parser';
import { appendQuestionRevision } from '../seed/question-revision-writer';
import {
  prepareSeedQuestions,
  recordSeedWithdrawal,
  replaceQuestionTags,
  sortedTags,
} from '../seed/question-syncer';
import {
  lockReleasePointer,
  ReleaseActivationError,
  type ReleaseItem,
  stageRelease,
} from './release-activation';
import { buildReleaseManifest, releaseManifestHash } from './release-manifest';

type Db = PostgresJsDatabase<typeof schema>;

export type StageSummary = {
  releaseId: string;
  parentReleaseId: string;
  /** An existing release with the same manifest on the same parent. */
  reusedRelease: boolean;
  /** New questions, written as drafts. */
  inserted: number;
  /** Revisions appended without becoming current. */
  appended: number;
  /** Files whose content matched an existing revision. */
  reused: number;
  /** Authored files archived in MDX, each recorded as a withdrawal. */
  withdrawn: number;
  /** Published files: the release's items. */
  items: number;
};

// A revision's content_hash is the stored-fields-json-v1 hash of exactly what
// it holds (ADR-021), so a file matches a revision when the hashes agree.
async function revisionForContent(
  tx: Db,
  questionId: string,
  seed: SeedQuestionRep,
): Promise<string | null> {
  const [match] = await tx
    .select({ id: schema.questionRevisions.id })
    .from(schema.questionRevisions)
    .where(
      and(
        eq(schema.questionRevisions.questionId, questionId),
        eq(
          schema.questionRevisions.contentHash,
          questionRevisionContentHash(revisionFieldsFromSeed(seed), {
            hash: sha256Hex,
          }),
        ),
      ),
    )
    .limit(1);
  return match?.id ?? null;
}

// DEBT-483 / ADR-021 decision 6: in production, content arrives as a staged
// release. Staging writes only what no reader sees: a new question is a draft,
// and changed content is a revision that does not become current. The
// release names each published file's question at the revision matching the
// file, and is built on the active release. Activation, a separate step,
// makes it live. Tags are not versioned (decision 1), so they change in place.
// The whole stage is one transaction, so it is staged entirely or not at all.
export async function stageReleaseFromFiles(
  db: Db,
  files: readonly SeedSourceFile[],
): Promise<StageSummary> {
  const prepared = prepareSeedQuestions(files);
  return db.transaction(async (tx) => {
    // The pointer exclusively, then question rows: every content writer's order.
    const active = await lockReleasePointer(tx);
    if (active === null) {
      throw new ReleaseActivationError(
        'NO_ACTIVE_RELEASE',
        'No release is active, so there is no base to stage on. Bootstrap releases first; until then the direct seed writes content.',
      );
    }
    const slugs = prepared.map(({ seedFromFile }) => seedFromFile.slug);
    const existing = await tx
      .select({ id: schema.questions.id, slug: schema.questions.slug })
      .from(schema.questions)
      .where(inArray(schema.questions.slug, slugs))
      .orderBy(asc(schema.questions.id))
      .for('no key update');
    const idBySlug = new Map(existing.map((row) => [row.slug, row.id]));

    // #953: a withdrawn question is never brought back; a correction takes a
    // new QID.
    const withdrawn = await tx
      .selectDistinct({ questionId: schema.questionWithdrawals.questionId })
      .from(schema.questionWithdrawals)
      .where(
        inArray(
          schema.questionWithdrawals.questionId,
          existing.map((row) => row.id),
        ),
      );
    const withdrawnIds = new Set(withdrawn.map((row) => row.questionId));
    const revived = prepared
      .filter(
        ({ seedFromFile }) =>
          seedFromFile.status !== 'archived' &&
          withdrawnIds.has(idBySlug.get(seedFromFile.slug) ?? ''),
      )
      .map(({ seedFromFile }) => seedFromFile.slug);
    if (revived.length > 0) {
      throw new Error(
        `Refusing to stage withdrawn question ${revived.join(', ')}. Use a new question QID for a replacement.`,
      );
    }

    const summary = { inserted: 0, appended: 0, reused: 0, withdrawn: 0 };
    const items: ReleaseItem[] = [];
    for (const { file, seedFromFile: seed } of prepared) {
      let questionId = idBySlug.get(seed.slug);
      let revisionId: string;
      if (questionId === undefined) {
        // A draft pointing at its first revision, written next; the deferred
        // key is checked at commit, as the seed does.
        revisionId = randomUUID();
        const created = onlyRow(
          await tx
            .insert(schema.questions)
            .values({
              slug: seed.slug,
              status: 'draft',
              currentRevisionId: revisionId,
            })
            .returning({ id: schema.questions.id }),
          `Failed to stage question "${seed.slug}"`,
        );
        questionId = created.id;
        await appendQuestionRevision(
          tx,
          questionId,
          revisionFieldsFromSeed(seed),
          { revisionId },
        );
        await replaceQuestionTags(tx, questionId, seed.tags);
        summary.inserted += 1;
      } else {
        const matching = await revisionForContent(tx, questionId, seed);
        if (matching === null) {
          revisionId = (
            await appendQuestionRevision(
              tx,
              questionId,
              revisionFieldsFromSeed(seed),
              { makeCurrent: false },
            )
          ).revisionId;
          summary.appended += 1;
        } else {
          revisionId = matching;
          summary.reused += 1;
        }
        await replaceTagsIfChanged(tx, questionId, seed);
      }
      if (await recordSeedWithdrawal(tx, questionId, seed, file.absolutePath)) {
        summary.withdrawn += 1;
      }
      if (seed.status === 'published') {
        items.push({ questionId, questionRevisionId: revisionId });
      }
    }
    if (items.length === 0) {
      throw new Error(
        'Refusing to stage a release with no published question: activating it would take every question out of the bank.',
      );
    }

    const reused = await existingRelease(tx, items, active);
    const releaseId =
      reused ?? (await stageRelease(tx, { items, parentReleaseId: active }));
    return {
      releaseId,
      parentReleaseId: active,
      reusedRelease: reused !== null,
      ...summary,
      items: items.length,
    };
  });
}

async function replaceTagsIfChanged(
  tx: Db,
  questionId: string,
  seed: SeedQuestionRep,
): Promise<void> {
  const current = await tx
    .select({
      slug: schema.tags.slug,
      name: schema.tags.name,
      kind: schema.tags.kind,
    })
    .from(schema.questionTags)
    .innerJoin(schema.tags, eq(schema.questionTags.tagId, schema.tags.id))
    .where(eq(schema.questionTags.questionId, questionId));
  if (
    JSON.stringify(sortedTags(current)) !==
    JSON.stringify(sortedTags(seed.tags))
  ) {
    await replaceQuestionTags(tx, questionId, seed.tags);
  }
}

// The same manifest on the same parent is the same release (migration 0048).
async function existingRelease(
  tx: Db,
  items: readonly ReleaseItem[],
  parentReleaseId: string,
): Promise<string | null> {
  const entries = await tx
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
        items.map((item) => item.questionRevisionId),
      ),
    );
  const [release] = await tx
    .select({ id: schema.contentReleases.id })
    .from(schema.contentReleases)
    .where(
      and(
        eq(
          schema.contentReleases.manifestHash,
          releaseManifestHash(buildReleaseManifest(entries)),
        ),
        eq(schema.contentReleases.parentReleaseId, parentReleaseId),
      ),
    );
  return release?.id ?? null;
}
