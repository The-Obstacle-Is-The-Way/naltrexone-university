import { and, eq, inArray, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import matter from 'gray-matter';
import * as schema from '../../db/schema';
import {
  canonicalJsonString,
  sha256Hex,
} from '../../lib/content/parse-mdx-question';
import {
  computeChoiceSyncPlan,
  computeReferencedChoiceIds,
  computeTemporarySortOrders,
} from '../seed-helpers';
import type { SeedSourceFile } from './file-reader';
import { buildSeedRepFromDb, parseSeedQuestionFile } from './question-parser';
import { upsertTags, validateSeedQuestionTags } from './tag-manager';

export type SeedSyncCounts = {
  inserted: number;
  updated: number;
  skipped: number;
};

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

async function moveExistingChoicesToTemporarySortOrders(
  tx: PostgresJsDatabase<typeof schema>,
  existingChoices: ReadonlyArray<{ id: string; sortOrder: number }>,
): Promise<void> {
  for (const choice of computeTemporarySortOrders(existingChoices)) {
    await tx
      .update(schema.choices)
      .set({ sortOrder: choice.sortOrder })
      .where(eq(schema.choices.id, choice.id));
  }
}

export async function syncQuestionsFromFiles(
  db: PostgresJsDatabase<typeof schema>,
  files: SeedSourceFile[],
): Promise<SeedSyncCounts> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    let seedSlug = extractSeedSlugForError(file.raw);

    try {
      const seedFromFile = parseSeedQuestionFile(file.raw);
      seedSlug = seedFromFile.slug;
      validateSeedQuestionTags({
        slug: seedFromFile.slug,
        tags: seedFromFile.tags,
      });

      const fileHash = sha256Hex(canonicalJsonString(seedFromFile));

      const existing = await db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.slug, seedFromFile.slug))
        .limit(1);
      const existingQuestion = existing.at(0);

      if (!existingQuestion) {
        await db.transaction(async (tx) => {
          const [createdQuestion] = await tx
            .insert(schema.questions)
            .values({
              slug: seedFromFile.slug,
              stemMd: seedFromFile.stem_md,
              explanationMd: seedFromFile.explanation_md,
              referenceMd: seedFromFile.reference_md,
              difficulty: seedFromFile.difficulty,
              status: seedFromFile.status,
            })
            .returning({ id: schema.questions.id });

          if (!createdQuestion) {
            throw new Error(
              `Failed to insert question for slug "${seedFromFile.slug}"`,
            );
          }

          await tx.insert(schema.choices).values(
            seedFromFile.choices.map((choice) => ({
              questionId: createdQuestion.id,
              label: choice.label,
              textMd: choice.text_md,
              isCorrect: choice.is_correct,
              explanationMd: choice.explanation_md,
              sortOrder: choice.sort_order,
            })),
          );

          const tagMap = await upsertTags(tx, seedFromFile.tags);
          await tx.insert(schema.questionTags).values(
            seedFromFile.tags.map((tag) => ({
              questionId: createdQuestion.id,
              tagId:
                tagMap.get(tag.slug)?.id ??
                (() => {
                  throw new Error(`Missing tag id for slug "${tag.slug}"`);
                })(),
            })),
          );
        });

        inserted += 1;
        continue;
      }

      const existingChoices = await db
        .select()
        .from(schema.choices)
        .where(eq(schema.choices.questionId, existingQuestion.id));

      const existingTags = await db
        .select({
          slug: schema.tags.slug,
          name: schema.tags.name,
          kind: schema.tags.kind,
        })
        .from(schema.questionTags)
        .innerJoin(schema.tags, eq(schema.questionTags.tagId, schema.tags.id))
        .where(eq(schema.questionTags.questionId, existingQuestion.id));

      const seedFromDb = buildSeedRepFromDb(
        existingQuestion,
        existingChoices,
        existingTags,
      );

      const dbHash = sha256Hex(canonicalJsonString(seedFromDb));
      if (dbHash === fileHash) {
        skipped += 1;
        continue;
      }

      const desiredLabels = new Set(
        seedFromFile.choices.map((choice) => choice.label),
      );
      const deleteCandidates = existingChoices.filter(
        (choice) => !desiredLabels.has(choice.label),
      );

      let referencedChoiceIds: ReadonlySet<string> = new Set();
      if (deleteCandidates.length > 0) {
        const deleteCandidateIds = deleteCandidates.map((choice) => choice.id);

        const attemptRows = await db
          .select({ selectedChoiceId: schema.attempts.selectedChoiceId })
          .from(schema.attempts)
          .where(
            and(
              eq(schema.attempts.questionId, existingQuestion.id),
              inArray(schema.attempts.selectedChoiceId, deleteCandidateIds),
            ),
          );

        const stateRows = await db
          .select({
            latestSelectedChoiceId:
              schema.practiceSessionQuestionStates.latestSelectedChoiceId,
            draftSelectedChoiceId:
              schema.practiceSessionQuestionStates.draftSelectedChoiceId,
          })
          .from(schema.practiceSessionQuestionStates)
          .where(
            and(
              eq(
                schema.practiceSessionQuestionStates.questionId,
                existingQuestion.id,
              ),
              or(
                inArray(
                  schema.practiceSessionQuestionStates.latestSelectedChoiceId,
                  deleteCandidateIds,
                ),
                inArray(
                  schema.practiceSessionQuestionStates.draftSelectedChoiceId,
                  deleteCandidateIds,
                ),
              ),
            ),
          );

        referencedChoiceIds = computeReferencedChoiceIds({
          attemptRows,
          stateRows,
        });
      }

      const { deleteChoiceIds } = computeChoiceSyncPlan({
        existingChoices: existingChoices.map((choice) => ({
          id: choice.id,
          label: choice.label,
        })),
        desiredChoices: seedFromFile.choices.map((choice) => ({
          label: choice.label,
        })),
        referencedChoiceIds,
      });
      const deleteChoiceIdSet = new Set(deleteChoiceIds);
      const survivingChoices = existingChoices
        .filter((choice) => !deleteChoiceIdSet.has(choice.id))
        .map((choice) => ({ id: choice.id, sortOrder: choice.sortOrder }));

      await db.transaction(async (tx) => {
        await tx
          .update(schema.questions)
          .set({
            stemMd: seedFromFile.stem_md,
            explanationMd: seedFromFile.explanation_md,
            referenceMd: seedFromFile.reference_md,
            difficulty: seedFromFile.difficulty,
            status: seedFromFile.status,
            updatedAt: new Date(),
          })
          .where(eq(schema.questions.id, existingQuestion.id));

        if (deleteChoiceIds.length > 0) {
          await tx
            .delete(schema.choices)
            .where(inArray(schema.choices.id, deleteChoiceIds));
        }

        await moveExistingChoicesToTemporarySortOrders(tx, survivingChoices);

        for (const choice of seedFromFile.choices) {
          await tx
            .insert(schema.choices)
            .values({
              questionId: existingQuestion.id,
              label: choice.label,
              textMd: choice.text_md,
              isCorrect: choice.is_correct,
              explanationMd: choice.explanation_md,
              sortOrder: choice.sort_order,
            })
            .onConflictDoUpdate({
              target: [schema.choices.questionId, schema.choices.label],
              set: {
                textMd: choice.text_md,
                isCorrect: choice.is_correct,
                explanationMd: choice.explanation_md,
                sortOrder: choice.sort_order,
              },
            });
        }

        await tx
          .delete(schema.questionTags)
          .where(eq(schema.questionTags.questionId, existingQuestion.id));

        const tagMap = await upsertTags(tx, seedFromFile.tags);
        await tx.insert(schema.questionTags).values(
          seedFromFile.tags.map((tag) => ({
            questionId: existingQuestion.id,
            tagId:
              tagMap.get(tag.slug)?.id ??
              (() => {
                throw new Error(`Missing tag id for slug "${tag.slug}"`);
              })(),
          })),
        );
      });

      updated += 1;
    } catch (error) {
      throw createSeedQuestionSyncError({
        file,
        slug: seedSlug,
        cause: error,
      });
    }
  }

  return { inserted, updated, skipped };
}
