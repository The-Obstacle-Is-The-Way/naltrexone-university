import { and, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { canonicalizeMarkdown } from '../../lib/content/parse-mdx-question';
import {
  answerKeyChanged,
  type KeyChoice,
} from '../../src/domain/services/answer-key';

type Db = PostgresJsDatabase<typeof schema>;

export type ReleaseChanges = {
  archive: string[];
  publish: string[];
  update: string[];
  revert: string[];
  answerKeyChange: string[];
  answerKeyReturn: string[];
  replacesHeld: string[];
  withdraw: string[];
  excludedHeld: string[];
  excludedWithdrawn: string[];
};

// These expressions use the content_release_items alias i. Withdrawals cover
// a question permanently; holds cover their exact revision (ADR-021).
const WITHDRAWN = sql`EXISTS (
  SELECT 1 FROM question_withdrawals w WHERE w.question_id = i.question_id
)`;
const HELD = sql`EXISTS (
  SELECT 1 FROM question_holds h
  WHERE h.question_revision_id = i.question_revision_id AND h.lifted_at IS NULL
)`;
export const ELIGIBLE_RELEASE_ITEM = sql`(NOT ${WITHDRAWN} AND NOT ${HELD})`;

// Both callers hold the release pointer. This reads the projection without
// locking question rows or changing availability.
export async function readReleaseChanges(
  tx: Db,
  releaseId: string,
  withdrawing: readonly { slug: string }[],
) {
  const publishing = await tx.execute<{
    question_id: string;
    question_revision_id: string;
    current_revision_id: string;
    slug: string;
    change: 'publish' | 'update' | 'revert' | null;
    replaces_held: boolean;
  }>(sql`
    SELECT i.question_id, i.question_revision_id, q.current_revision_id, q.slug,
      CASE
        WHEN ir.revision_number < cr.revision_number THEN 'revert'
        WHEN q.status <> 'published' THEN 'publish'
        WHEN q.current_revision_id <> i.question_revision_id THEN 'update'
      END AS change,
      EXISTS (
        SELECT 1 FROM question_holds h
        WHERE h.question_id = i.question_id
          AND h.lifted_at IS NULL
          AND h.question_revision_id <> i.question_revision_id
      ) AS replaces_held
    FROM content_release_items i
    JOIN questions q ON q.id = i.question_id
    JOIN question_revisions ir ON ir.id = i.question_revision_id
    LEFT JOIN question_revisions cr ON cr.id = q.current_revision_id
    WHERE i.release_id = ${releaseId} AND ${ELIGIBLE_RELEASE_ITEM}
    ORDER BY i.question_id
  `);
  const archiving = await tx.execute<{ id: string; slug: string }>(sql`
    SELECT q.id, q.slug FROM questions q
    WHERE q.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM content_release_items i
        WHERE i.release_id = ${releaseId}
          AND i.question_id = q.id
          AND ${ELIGIBLE_RELEASE_ITEM}
      )
    ORDER BY q.id
  `);
  const excluded = await tx.execute<{ slug: string; withdrawn: boolean }>(sql`
    SELECT q.slug, ${WITHDRAWN} AS withdrawn
    FROM content_release_items i
    JOIN questions q ON q.id = i.question_id
    WHERE i.release_id = ${releaseId} AND NOT ${ELIGIBLE_RELEASE_ITEM}
  `);
  // Activated membership and the bootstrap's frozen candidates are the
  // history boundary. A later stage alone supplies no publication evidence.
  // Receipts are read under the pointer lock; timestamps do not order them.
  // The uncorrelated IN expands the candidate lists once, not per revision.
  const earlier = await tx
    .select({
      questionId: schema.questionRevisions.questionId,
      revisionId: schema.questionRevisions.id,
    })
    .from(schema.questionRevisions)
    .where(
      and(
        inArray(
          schema.questionRevisions.questionId,
          publishing.map((row) => row.question_id),
        ),
        sql`(
          EXISTS (
            SELECT 1 FROM content_release_items i
            JOIN content_release_activations a ON a.release_id = i.release_id
            WHERE i.question_revision_id = ${schema.questionRevisions.id}
          ) OR ${schema.questionRevisions.id}::text IN (
            SELECT jsonb_array_elements_text(r.manifest -> 'preBootstrapCandidates')
            FROM content_releases r
            WHERE EXISTS (
              SELECT 1 FROM content_release_activations a
              WHERE a.release_id = r.id
            )
          )
        )`,
      ),
    );
  const choices = await tx
    .select({
      questionRevisionId: schema.choices.questionRevisionId,
      label: schema.choices.label,
      textMd: schema.choices.textMd,
      isCorrect: schema.choices.isCorrect,
    })
    .from(schema.choices)
    .where(
      inArray(schema.choices.questionRevisionId, [
        ...publishing.flatMap((row) => [
          row.current_revision_id,
          row.question_revision_id,
        ]),
        ...earlier.map((row) => row.revisionId),
      ]),
    );
  const keys = new Map<string, KeyChoice[]>();
  for (const choice of choices) {
    const key = keys.get(choice.questionRevisionId) ?? [];
    key.push({
      label: choice.label,
      textMd: canonicalizeMarkdown(choice.textMd),
      isCorrect: choice.isCorrect,
    });
    keys.set(choice.questionRevisionId, key);
  }
  const bySlug = (rows: readonly { slug: string }[]) =>
    rows.map((row) => row.slug).sort();
  const changedKeys = publishing.filter((row) =>
    answerKeyChanged(
      keys.get(row.current_revision_id) ?? [],
      keys.get(row.question_revision_id) ?? [],
    ),
  );
  const earlierByQuestion = new Map<string, string[]>();
  for (const row of earlier) {
    const revisions = earlierByQuestion.get(row.questionId) ?? [];
    revisions.push(row.revisionId);
    earlierByQuestion.set(row.questionId, revisions);
  }
  const changes: ReleaseChanges = {
    archive: bySlug(archiving),
    publish: bySlug(publishing.filter((row) => row.change === 'publish')),
    update: bySlug(publishing.filter((row) => row.change === 'update')),
    revert: bySlug(publishing.filter((row) => row.change === 'revert')),
    answerKeyChange: bySlug(changedKeys),
    answerKeyReturn: bySlug(
      changedKeys.filter((row) =>
        (earlierByQuestion.get(row.question_id) ?? []).some(
          (revisionId) =>
            !answerKeyChanged(
              keys.get(revisionId) ?? [],
              keys.get(row.question_revision_id) ?? [],
            ),
        ),
      ),
    ),
    replacesHeld: bySlug(
      publishing.filter((row) => row.change !== null && row.replaces_held),
    ),
    withdraw: bySlug(withdrawing),
    excludedHeld: bySlug(excluded.filter((row) => !row.withdrawn)),
    excludedWithdrawn: bySlug(excluded.filter((row) => row.withdrawn)),
  };
  return { publishing, archiving, changes };
}
