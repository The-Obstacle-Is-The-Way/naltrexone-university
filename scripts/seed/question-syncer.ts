import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import matter from 'gray-matter';
import * as schema from '../../db/schema';
import {
  canonicalJsonString,
  sha256Hex,
} from '../../lib/content/parse-mdx-question';
import {
  type AnswerKeyChange,
  computeAnswerKeyChanges,
  computeChoiceSyncPlan,
  computeReferencedChoiceIds,
  computeTemporarySortOrders,
} from '../seed-helpers';
import { computeContentRewriteChanges } from './content-rewrite-policy';
import type { SeedSourceFile } from './file-reader';
import {
  buildSeedRepFromDb,
  isSyntheticPlaceholderSource,
  parseSeedQuestionFile,
  type SeedTag,
} from './question-parser';
import { upsertTags, validateSeedQuestionTags } from './tag-manager';

// A question the seed left unchanged because incomplete practice sessions
// bind the revision the change would refresh (ADR-021).
export type SeedDeferral = { slug: string; sessions: number };

export type SeedSyncCounts = {
  inserted: number;
  updated: number;
  skipped: number;
  deferred: SeedDeferral[];
};

class RevisionInUseError extends Error {
  constructor(readonly sessions: number) {
    super(`revision is bound by ${sessions} incomplete practice sessions`);
  }
}

const ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY_ENV =
  'SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY';

type GradedHistoryCounts = {
  attempts: number;
  practiceSessionStates: number;
};

function formatAnswerKeyChanges(changes: readonly AnswerKeyChange[]): string {
  return changes
    .map((change) => `${change.label}:${change.from}->${change.to}`)
    .join(', ');
}

function hasGradedHistory(counts: GradedHistoryCounts): boolean {
  return counts.attempts > 0 || counts.practiceSessionStates > 0;
}

function shouldAllowKeyChangesOverGradedHistory(): boolean {
  return process.env[ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY_ENV] === 'true';
}

async function countGradedHistoryForQuestion(
  tx: PostgresJsDatabase<typeof schema>,
  questionId: string,
): Promise<GradedHistoryCounts> {
  const [attemptCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.attempts)
    .where(eq(schema.attempts.questionId, questionId));

  const [stateCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.practiceSessionQuestionStates)
    .where(
      and(
        eq(schema.practiceSessionQuestionStates.questionId, questionId),
        isNotNull(schema.practiceSessionQuestionStates.latestIsCorrect),
      ),
    );

  return {
    attempts: attemptCount?.count ?? 0,
    practiceSessionStates: stateCount?.count ?? 0,
  };
}

async function enforceGradedHistoryPolicy(input: {
  tx: PostgresJsDatabase<typeof schema>;
  questionId: string;
  slug: string;
  changes: readonly AnswerKeyChange[];
  contentChanges: readonly string[];
}): Promise<void> {
  if (input.changes.length === 0 && input.contentChanges.length === 0) return;

  const counts = await countGradedHistoryForQuestion(
    input.tx,
    input.questionId,
  );
  if (!hasGradedHistory(counts)) return;

  const countSummary = `attempts=${counts.attempts}, practiceSessionStates=${counts.practiceSessionStates}`;

  if (input.contentChanges.length > 0) {
    throw new Error(
      `Refusing to rewrite content for "${input.slug}" because graded history exists (${countSummary}; changes=${input.contentChanges.join(', ')}). Use a new question ID and explicitly archive the replaced question.`,
    );
  }

  const changeSummary = formatAnswerKeyChanges(input.changes);

  if (shouldAllowKeyChangesOverGradedHistory()) {
    console.warn(
      `[seed] Overriding answer-key change for "${input.slug}" with ${ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY_ENV}=true (${countSummary}; changes=${changeSummary})`,
    );
    return;
  }

  throw new Error(
    `Refusing to change answer key for "${input.slug}" because graded history exists (${countSummary}; changes=${changeSummary}). Set ${ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY_ENV}=true to override explicitly.`,
  );
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

      return {
        file,
        seedFromFile,
        fileHash: sha256Hex(canonicalJsonString(seedFromFile)),
      };
    } catch (error) {
      throw createSeedQuestionSyncError({ file, slug: seedSlug, cause: error });
    }
  });
}

// ADR-021 phase 1: a question's revision 1 mirrors its legacy row. The SQL
// function from migration 0039 creates, refreshes or re-points it and attaches
// the choices, inside the caller's transaction.
//
// Phase 2a: it refuses to refresh a revision that an incomplete practice
// session binds, so content never changes under a learner mid-session. #951's
// guard covers graded history; this covers an item not yet answered, and a
// change #951 does not count as content, such as difficulty. The caller's
// transaction rolls back and the question waits for a later run.
async function syncQuestionRevision(
  tx: PostgresJsDatabase<typeof schema>,
  questionId: string,
): Promise<void> {
  const [binding] = await tx.execute<{ sessions: number }>(sql`
    SELECT count(DISTINCT s.practice_session_id)::int AS sessions
    FROM questions q
    JOIN question_revisions r ON r.id = q.current_revision_id
    JOIN practice_session_question_states s ON s.question_revision_id = r.id
    JOIN practice_sessions p ON p.id = s.practice_session_id
    WHERE q.id = ${questionId}::uuid
      AND p.ended_at IS NULL
      AND r.content_hash <> encode(
        sha256(convert_to(question_content_json_v1(q.id), 'UTF8')),
        'hex'
      )
  `);
  const sessions = Number(binding?.sessions ?? 0);
  if (sessions > 0) throw new RevisionInUseError(sessions);

  await tx.execute(sql`SELECT sync_question_revision_v1(${questionId}::uuid)`);
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
  const prepared = prepareSeedQuestions(files);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const deferred: SeedDeferral[] = [];

  for (const { file, seedFromFile, fileHash } of prepared) {
    try {
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
          await syncQuestionRevision(tx, createdQuestion.id);
        });

        inserted += 1;
        continue;
      }

      const syncResult = await db.transaction(async (tx) => {
        const [lockedQuestion] = await tx
          .select()
          .from(schema.questions)
          .where(eq(schema.questions.id, existingQuestion.id))
          .for('update');
        if (!lockedQuestion) {
          throw new Error(
            `Question disappeared during seed sync for slug "${seedFromFile.slug}"`,
          );
        }

        if (
          lockedQuestion.status === 'archived' &&
          seedFromFile.status !== 'archived' &&
          !isSyntheticPlaceholderSource(seedFromFile.slug, file.absolutePath)
        ) {
          throw new Error(
            `Refusing to reactivate archived question "${seedFromFile.slug}" from seed input. Use a new question QID for a replacement.`,
          );
        }

        const existingChoices = await tx
          .select()
          .from(schema.choices)
          .where(eq(schema.choices.questionId, lockedQuestion.id));

        const existingTags = await tx
          .select({
            slug: schema.tags.slug,
            name: schema.tags.name,
            kind: schema.tags.kind,
          })
          .from(schema.questionTags)
          .innerJoin(schema.tags, eq(schema.questionTags.tagId, schema.tags.id))
          .where(eq(schema.questionTags.questionId, lockedQuestion.id));

        const seedFromDb = buildSeedRepFromDb(
          lockedQuestion,
          existingChoices,
          existingTags,
        );

        const dbHash = sha256Hex(canonicalJsonString(seedFromDb));
        if (dbHash === fileHash) {
          await syncQuestionRevision(tx, lockedQuestion.id);
          return 'skipped' as const;
        }

        const answerKeyChanges = computeAnswerKeyChanges({
          existingChoices: existingChoices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            isCorrect: choice.isCorrect,
          })),
          desiredChoices: seedFromFile.choices.map((choice) => ({
            label: choice.label,
            isCorrect: choice.is_correct,
          })),
        });
        await enforceGradedHistoryPolicy({
          tx,
          questionId: lockedQuestion.id,
          slug: seedFromFile.slug,
          changes: answerKeyChanges,
          contentChanges: computeContentRewriteChanges(
            seedFromDb,
            seedFromFile,
          ),
        });

        const desiredLabels = new Set(
          seedFromFile.choices.map((choice) => choice.label),
        );
        const deleteCandidates = existingChoices.filter(
          (choice) => !desiredLabels.has(choice.label),
        );
        const deleteCandidateIds = deleteCandidates.map((choice) => choice.id);

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
          .where(eq(schema.questions.id, lockedQuestion.id));

        let referencedChoiceIds: ReadonlySet<string> = new Set();
        if (deleteCandidateIds.length > 0) {
          await tx
            .select({ id: schema.choices.id })
            .from(schema.choices)
            .where(inArray(schema.choices.id, deleteCandidateIds))
            .for('update');

          const attemptRows = await tx
            .select({ selectedChoiceId: schema.attempts.selectedChoiceId })
            .from(schema.attempts)
            .where(
              and(
                eq(schema.attempts.questionId, lockedQuestion.id),
                inArray(schema.attempts.selectedChoiceId, deleteCandidateIds),
              ),
            );

          const stateRows = await tx
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
                  lockedQuestion.id,
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
              questionId: lockedQuestion.id,
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
          .where(eq(schema.questionTags.questionId, lockedQuestion.id));

        const tagMap = await upsertTags(tx, seedFromFile.tags);
        await tx.insert(schema.questionTags).values(
          seedFromFile.tags.map((tag) => ({
            questionId: lockedQuestion.id,
            tagId:
              tagMap.get(tag.slug)?.id ??
              (() => {
                throw new Error(`Missing tag id for slug "${tag.slug}"`);
              })(),
          })),
        );
        await syncQuestionRevision(tx, lockedQuestion.id);

        return 'updated' as const;
      });

      if (syncResult === 'skipped') {
        skipped += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      if (error instanceof RevisionInUseError) {
        deferred.push({ slug: seedFromFile.slug, sessions: error.sessions });
        continue;
      }
      throw createSeedQuestionSyncError({
        file,
        slug: seedFromFile.slug,
        cause: error,
      });
    }
  }

  return { inserted, updated, skipped, deferred };
}
