import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import type { DecisionRecord } from '../seed/qid-command-args';
import {
  type ActivationSummary,
  activateRelease,
  lockReleasePointer,
  ReleaseActivationError,
} from './release-activation';

type Db = PostgresJsDatabase<typeof schema>;

export type HoldChange = {
  qids: readonly string[];
  record: DecisionRecord;
  lift: boolean;
  holdIds?: readonly string[];
  revert?: readonly string[];
};

export type HoldSummary = {
  /** Holds placed, or lifted. */
  holds: number;
  activation: ActivationSummary;
};

// DEBT-483 / ADR-021 decision 5: a hold keeps the revision the active
// release publishes out of every activation until it is lifted. A QID lift
// targets that revision; a named hold lift targets exactly that decision,
// even after replacement or retirement. Placing or lifting re-applies the active
// release in the same transaction, so the question leaves the bank, or
// returns to it, at once. With no release active, nothing derives status from
// the overlay and a hold would change nothing, so this refuses.
export async function changeHolds(
  db: Db,
  change: HoldChange,
): Promise<HoldSummary> {
  if (change.holdIds?.length && (!change.lift || change.qids.length > 0)) {
    throw new Error('Named hold IDs require a lift without QIDs');
  }
  return db.transaction(async (tx) => {
    const active = await lockReleasePointer(tx);
    if (active === null) {
      throw new ReleaseActivationError(
        'NO_ACTIVE_RELEASE',
        'No release is active, so a hold would change nothing. Withdraw the question instead, or bootstrap releases first.',
      );
    }
    let items: { questionId: string; questionRevisionId: string }[] = [];
    const namedHoldIds = change.holdIds?.length
      ? [...change.holdIds]
      : undefined;
    if (namedHoldIds) {
      const holds = await tx
        .select({ id: schema.questionHolds.id })
        .from(schema.questionHolds)
        .where(inArray(schema.questionHolds.id, namedHoldIds));
      const found = new Set(holds.map((hold) => hold.id));
      if (namedHoldIds.some((id) => !found.has(id)))
        throw new Error('Unknown hold ID');
    } else {
      // The pointer excludes content writers. Defer question row locks to
      // activation, which locks the whole set in order; locking this subset
      // first can deadlock with a session reader (BUG-314).
      const questions = await tx
        .select({ id: schema.questions.id, slug: schema.questions.slug })
        .from(schema.questions)
        .where(inArray(schema.questions.slug, [...change.qids]))
        .orderBy(asc(schema.questions.id));
      const found = new Set(questions.map((question) => question.slug));
      const missing = change.qids.filter((qid) => !found.has(qid));
      if (missing.length > 0) {
        throw new Error(`Unknown question QID: ${missing.join(', ')}`);
      }
      const questionIds = questions.map((question) => question.id);

      // A hold, and a lift, act on the revision the active release publishes.
      items = await tx
        .select({
          questionId: schema.contentReleaseItems.questionId,
          questionRevisionId: schema.contentReleaseItems.questionRevisionId,
        })
        .from(schema.contentReleaseItems)
        .where(
          and(
            eq(schema.contentReleaseItems.releaseId, active),
            inArray(schema.contentReleaseItems.questionId, questionIds),
          ),
        );
      const live = new Set(items.map((item) => item.questionId));
      const outside = questions.filter((question) => !live.has(question.id));
      if (outside.length > 0) {
        throw new Error(
          `Not in the active release, so it has no live revision: ${outside.map((question) => question.slug).join(', ')}`,
        );
      }
    }

    const changed = change.lift
      ? await tx
          .update(schema.questionHolds)
          .set({
            liftedAt: sql`now()`,
            liftReason: change.record.reason,
            liftAuthority: change.record.authority,
          })
          .where(
            and(
              namedHoldIds
                ? inArray(schema.questionHolds.id, namedHoldIds)
                : inArray(
                    schema.questionHolds.questionRevisionId,
                    items.map((item) => item.questionRevisionId),
                  ),
              isNull(schema.questionHolds.liftedAt),
            ),
          )
          .returning({ id: schema.questionHolds.id })
      : await tx
          .insert(schema.questionHolds)
          .values(items.map((item) => ({ ...item, ...change.record })))
          .onConflictDoNothing()
          .returning({ id: schema.questionHolds.id });

    // The re-application is the hold's or lift's own decision (DEBT-490).
    const activation = await activateRelease(tx, {
      releaseId: active,
      expectedActiveReleaseId: active,
      revert: change.revert ?? [],
      record: {
        reason: `hold ${change.lift ? 'lifted' : 'placed'}: ${change.record.reason}`,
        authority: change.record.authority,
      },
    });
    return { holds: changed.length, activation };
  });
}
