# BUG-270: Ordinary choice-label content edit can crash `pnpm db:seed` mid-batch via the `(question_id, sort_order)` unique index, aborting every subsequent question file in the same run

**Status:** Open
**Priority:** P2
**Date:** 2026-07-01

---

## Description

`db/schema.ts:370-373` defines `choices_question_id_sort_order_uq`, a `UNIQUE INDEX` on `(question_id, sort_order)`. Choice `sort_order` is assigned by sorting choices and numbering them sequentially: `question-parser.ts:54` sorts `parsed.frontmatter.choices`, and line 86 assigns `sort_order: index + 1` in that sorted order — so every seed sync recomputes every choice's `sort_order` from scratch based on current sort position, not a stable/persisted value.

`syncQuestionsFromFiles` (`scripts/seed/question-syncer.ts:205-225`) then upserts choices **sequentially**, one at a time, in that same sorted order:

```ts
for (const choice of seedFromFile.choices) {
  await tx.insert(schema.choices).values({...})
    .onConflictDoUpdate({
      target: [schema.choices.questionId, schema.choices.label],
      set: { ... sortOrder: choice.sort_order ... },
    });
}
```

`onConflictDoUpdate`'s target is `(questionId, label)` — the *other* unique index on this table (`choices_question_id_label_uq`) — not `(questionId, sortOrder)`. So this upsert only handles a **label** collision gracefully; it does nothing to avoid a **sort_order** collision against a row that hasn't been processed yet in this same loop.

## Impact

Concrete failure scenario: a content edit adds a new choice whose label sorts alphabetically **between** two existing survivors, without deleting anything (so the deletion guard at lines 199-203 never runs to vacate a slot first). Example: existing choices `A` (sort_order=1), `B` (sort_order=2); edit adds `AB`. Recomputed order is `A`(1), `AB`(2), `B`(3). The loop processes `A` first (unchanged, no-op). It then processes the *new* choice `AB` and tries to `INSERT ... sort_order=2` — but the existing `B` row still holds `sort_order=2` in the database (its own turn in the loop hasn't come yet). Postgres immediately raises `duplicate key value violates unique constraint "choices_question_id_sort_order_uq"`.

Because this happens inside `syncQuestionsFromFiles`'s per-file transaction with no try/catch, the raw Postgres error propagates and aborts that file's transaction (rolling back the question stem/tag update too, not just the choice inserts). `scripts/seed.ts` awaits `syncQuestionsFromFiles` once and catches only at `main()`'s top-level error logger, so this also stops the **entire remaining batch** — every question file after the failing one in that `pnpm db:seed` run is not attempted, and `archivePlaceholderQuestions` (which only runs after the full file loop completes) never executes for that run either. This is reachable via an entirely ordinary content-editing workflow (adding one new answer choice), not an edge case requiring malformed input.

## Resolution

Either (a) two-phase the per-question choice sync — first move all changed survivor rows to temporary/negative `sort_order` values (or delete and reinsert only when no historical references prevent it) to clear the collision space before assigning final values, or (b) replace the unique index with a deferrable unique constraint on `(question_id, sort_order)` so the same-transaction reorder is checked at commit rather than after each statement. Drizzle's current `uniqueIndex` declaration cannot express a deferrable unique constraint directly, so option (b) would require hand-authored migration SQL and a schema comment/test sentinel documenting the intentional drift from Drizzle's index DSL.

Do not make the seed continue after a failed content file by default. This project treats content seeding as an integrity operation; continuing would leave a partially-updated content set and could hide the first failed file behind later noise. A useful adjunct is to wrap the per-file transaction inside `syncQuestionsFromFiles` with slug/path context and then rethrow, preserving fail-fast semantics while making the failure actionable.

## Verification

A seed-pipeline test: seed a question with choices `A`, `B` (in that sort order), then re-seed the same question with content that inserts a new choice `AB` between them (no deletions). Assert the sync succeeds and all three choices end up with distinct, correctly-ordered `sort_order` values. If contextual error wrapping is added, include a negative-path test that the thrown error names the failing slug/path while still stopping the batch.

## Related

- PR #537 (indirect — the underlying `sort_order` unique index and upsert loop predate this branch; this is a latent bug in the seed pipeline made newly relevant by the accompanying seed-sync audit), `db/schema.ts:370-373`, `scripts/seed/question-syncer.ts:205-225`, `scripts/seed/question-parser.ts:54,86`, `scripts/seed.ts`
- Found via a systematic seed/batch-idempotency audit (2026-07-01), independently re-verified by reading the upsert loop and the unique-index definition directly
