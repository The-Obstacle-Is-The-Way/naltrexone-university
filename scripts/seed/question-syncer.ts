import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import matter from 'gray-matter';
import * as schema from '../../db/schema';
import { canonicalQuestionRevisionJson } from '../../lib/content/question-revision-hash';
import type { SeedSourceFile } from './file-reader';
import { onlyRow } from './only-row';
import {
  isSyntheticPlaceholderSource,
  parseSeedQuestionFile,
  revisionFieldsFromDb,
  revisionFieldsFromSeed,
  type SeedQuestionRep,
  type SeedTag,
} from './question-parser';
import { appendQuestionRevision } from './question-revision-writer';
import { upsertTags, validateSeedQuestionTags } from './tag-manager';

export type SeedSyncCounts = {
  inserted: number;
  /** Questions changed in any way: a new revision, status or tags. */
  updated: number;
  /** Of those, questions whose content became a new revision. */
  revised: number;
  skipped: number;
};

// ADR-021 phase 2b: migration 0042 installs this trigger with the per-revision
// choice keys and retires the in-place revision sync. Without it, appending a
// revision would collide with the per-question keys, and a seed from this
// commit must not run against an older schema.
export const APPEND_ONLY_MARKER_TRIGGER = 'question_revisions_reject_update';

export async function assertAppendOnlyRevisions(
  db: PostgresJsDatabase<typeof schema>,
  marker: string = APPEND_ONLY_MARKER_TRIGGER,
): Promise<void> {
  const [row] = await db.execute<{ ready: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = ${marker}) AS ready
  `);
  if (!row?.ready) {
    throw new Error(
      'Refusing to seed: this database has not applied migration 0042 (ADR-021 phase 2b, append-only question revisions). Run pnpm db:migrate against it first.',
    );
  }
}

function extractSeedSlugForError(raw: string): string | null {
  try {
    const slug = matter(raw).data?.slug;
    return typeof slug === 'string' && slug.length > 0 ? slug : null;
  } catch {
    // Best-effort context only; the original parse error is preserved as cause.
    return null;
  }
}

function createSeedQuestionSyncError(input: {
  file: SeedSourceFile;
  slug: string | null;
  cause: unknown;
}): Error {
  const slugContext = input.slug ? `"${input.slug}"` : 'with unknown slug';
  const causeMessage =
    input.cause instanceof Error ? `: ${input.cause.message}` : '';
  return new Error(
    `Failed to sync seed question ${slugContext} from ${input.file.absolutePath}${causeMessage}`,
    { cause: input.cause },
  );
}

function prepareSeedQuestions(files: readonly SeedSourceFile[]) {
  const questionPaths = new Map<string, string>();
  const tags = new Map<string, { tag: SeedTag; path: string }>();

  return files.map((file) => {
    let seedSlug = extractSeedSlugForError(file.raw);
    try {
      const seedFromFile = parseSeedQuestionFile(file.raw, file.absolutePath);
      seedSlug = seedFromFile.slug;
      validateSeedQuestionTags({ slug: seedSlug, tags: seedFromFile.tags });

      const firstPath = questionPaths.get(seedSlug);
      if (firstPath !== undefined) {
        throw new Error(
          `Duplicate seed question "${seedSlug}" appears in both ${firstPath} and ${file.absolutePath}`,
        );
      }
      questionPaths.set(seedSlug, file.absolutePath);

      for (const tag of seedFromFile.tags) {
        const previous = tags.get(tag.slug);
        if (
          previous &&
          (previous.tag.name !== tag.name || previous.tag.kind !== tag.kind)
        ) {
          throw new Error(
            `Conflicting seed tag "${tag.slug}" in ${previous.path} and ${file.absolutePath}: name and kind must agree across the bundle`,
          );
        }
        if (!previous) tags.set(tag.slug, { tag, path: file.absolutePath });
      }

      return { file, seedFromFile };
    } catch (error) {
      throw createSeedQuestionSyncError({ file, slug: seedSlug, cause: error });
    }
  });
}

function sortedTags(tags: readonly SeedTag[]): SeedTag[] {
  return [...tags]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(({ slug, name, kind }) => ({ slug, name, kind }));
}

async function replaceQuestionTags(
  tx: PostgresJsDatabase<typeof schema>,
  questionId: string,
  tags: SeedTag[],
): Promise<void> {
  await tx
    .delete(schema.questionTags)
    .where(eq(schema.questionTags.questionId, questionId));
  // upsertTags returns exactly the incoming tags, by slug.
  const tagRows = await upsertTags(tx, tags);
  await tx
    .insert(schema.questionTags)
    .values(
      [...tagRows.values()].map((tag) => ({ questionId, tagId: tag.id })),
    );
}

async function insertQuestion(
  db: PostgresJsDatabase<typeof schema>,
  seed: SeedQuestionRep,
): Promise<void> {
  await db.transaction(async (tx) => {
    // ADR-021 phase 3: the question points at its first revision, written
    // next in this transaction; the deferred key is checked at commit.
    const revisionId = randomUUID();
    const created = onlyRow(
      await tx
        .insert(schema.questions)
        .values({
          slug: seed.slug,
          status: seed.status,
          currentRevisionId: revisionId,
        })
        .returning({ id: schema.questions.id }),
      `Failed to insert question for slug "${seed.slug}"`,
    );
    await appendQuestionRevision(tx, created.id, revisionFieldsFromSeed(seed), {
      revisionId,
    });
    await replaceQuestionTags(tx, created.id, seed.tags);
  });
}

// ADR-021 phase 2b: changed content becomes a new revision; the question's
// status and tags, which belong to the question, change in place. History
// keeps the revision it answered, so there is no graded-history guard, and a
// session in progress keeps its bound revision, so nothing waits for it.
async function syncExistingQuestion(
  db: PostgresJsDatabase<typeof schema>,
  questionId: string,
  seed: SeedQuestionRep,
  sourcePath: string,
): Promise<'skipped' | 'updated' | 'revised'> {
  return db.transaction(async (tx) => {
    const locked = onlyRow(
      await tx
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, questionId))
        .for('update'),
      `Question disappeared during seed sync for slug "${seed.slug}"`,
    );
    if (
      locked.status === 'archived' &&
      seed.status !== 'archived' &&
      !isSyntheticPlaceholderSource(seed.slug, sourcePath)
    ) {
      throw new Error(
        `Refusing to reactivate archived question "${seed.slug}" from seed input. Use a new question QID for a replacement.`,
      );
    }
    // Required since migration 0043, so its revision always exists.
    const revision = onlyRow(
      await tx
        .select()
        .from(schema.questionRevisions)
        .where(eq(schema.questionRevisions.id, locked.currentRevisionId)),
      `Question "${seed.slug}" has no current revision`,
    );
    const choices = await tx
      .select()
      .from(schema.choices)
      .where(eq(schema.choices.questionRevisionId, revision.id))
      .orderBy(schema.choices.sortOrder);
    const existingTags = await tx
      .select({
        slug: schema.tags.slug,
        name: schema.tags.name,
        kind: schema.tags.kind,
      })
      .from(schema.questionTags)
      .innerJoin(schema.tags, eq(schema.questionTags.tagId, schema.tags.id))
      .where(eq(schema.questionTags.questionId, locked.id));

    const seedFields = revisionFieldsFromSeed(seed);
    const contentChanged =
      canonicalQuestionRevisionJson(revisionFieldsFromDb(revision, choices)) !==
      canonicalQuestionRevisionJson(seedFields);
    const statusChanged = locked.status !== seed.status;
    const tagsChanged =
      JSON.stringify(sortedTags(existingTags)) !==
      JSON.stringify(sortedTags(seed.tags));
    if (!contentChanged && !statusChanged && !tagsChanged) return 'skipped';

    if (contentChanged) {
      await appendQuestionRevision(tx, locked.id, seedFields);
    }
    if (statusChanged) {
      await tx
        .update(schema.questions)
        .set({ status: seed.status, updatedAt: new Date() })
        .where(eq(schema.questions.id, locked.id));
    }
    if (tagsChanged) {
      await replaceQuestionTags(tx, locked.id, seed.tags);
    }
    return contentChanged ? 'revised' : 'updated';
  });
}

export async function syncQuestionsFromFiles(
  db: PostgresJsDatabase<typeof schema>,
  files: SeedSourceFile[],
): Promise<SeedSyncCounts> {
  const prepared = prepareSeedQuestions(files);
  await assertAppendOnlyRevisions(db);
  const counts: SeedSyncCounts = {
    inserted: 0,
    updated: 0,
    revised: 0,
    skipped: 0,
  };

  for (const { file, seedFromFile } of prepared) {
    try {
      const [existing] = await db
        .select({ id: schema.questions.id })
        .from(schema.questions)
        .where(eq(schema.questions.slug, seedFromFile.slug))
        .limit(1);

      if (!existing) {
        await insertQuestion(db, seedFromFile);
        counts.inserted += 1;
        continue;
      }

      const outcome = await syncExistingQuestion(
        db,
        existing.id,
        seedFromFile,
        file.absolutePath,
      );
      if (outcome === 'skipped') {
        counts.skipped += 1;
      } else {
        counts.updated += 1;
        if (outcome === 'revised') counts.revised += 1;
      }
    } catch (error) {
      throw createSeedQuestionSyncError({
        file,
        slug: seedFromFile.slug,
        cause: error,
      });
    }
  }

  return counts;
}
