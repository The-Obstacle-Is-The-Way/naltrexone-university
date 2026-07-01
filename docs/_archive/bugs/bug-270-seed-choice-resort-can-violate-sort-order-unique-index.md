# BUG-270: Ordinary choice-label content edit can crash `pnpm db:seed` mid-batch via the `(question_id, sort_order)` unique index, aborting every subsequent question file in the same run

**Status:** Resolved
**Priority:** P2
**Date:** 2026-07-01
**Resolved:** 2026-07-01
**Scope:** Branch-local pre-merge defect in PR #537; fixed and verified before the Track A implementation shipped.

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

Concrete failure scenario: a content edit adds a new choice whose label sorts alphabetically **between** two existing survivors, without deleting anything (so the deletion guard at lines 199-203 never runs to vacate a slot first). Parser-valid example: existing choices `A` (sort_order=1), `C` (sort_order=2); edit adds `B`. Recomputed order is `A`(1), `B`(2), `C`(3). The loop processes `A` first (unchanged, no-op). It then processes the *new* choice `B` and tries to `INSERT ... sort_order=2` — but the existing `C` row still holds `sort_order=2` in the database (its own turn in the loop hasn't come yet). Postgres immediately raises `duplicate key value violates unique constraint "choices_question_id_sort_order_uq"`.

Because this happens inside `syncQuestionsFromFiles`'s per-file transaction with no try/catch, the raw Postgres error propagates and aborts that file's transaction (rolling back the question stem/tag update too, not just the choice inserts). `scripts/seed.ts` awaits `syncQuestionsFromFiles` once and catches only at `main()`'s top-level error logger, so this also stops the **entire remaining batch** — every question file after the failing one in that `pnpm db:seed` run is not attempted, and `archivePlaceholderQuestions` (which only runs after the full file loop completes) never executes for that run either. This is reachable via an entirely ordinary content-editing workflow (adding one new answer choice), not an edge case requiring malformed input.

## Resolution

Fixed on `chore/legacy-audit` as a branch-local pre-merge blocker in PR #537 with option (a), the smaller reversible seed-pipeline change:

- For existing questions whose content hash changes, `syncQuestionsFromFiles(...)` computes stale choices as before and still refuses to delete referenced choices.
- Inside the per-file transaction, after allowed stale-choice deletes, it moves all surviving existing choices for that question to temporary negative `sort_order` values lower than any currently stored value. This clears the positive `(question_id, sort_order)` collision space before the normal `(question_id, label)` upsert loop assigns final sort orders.
- The deferrable-constraint option was not used: it would require hand-authored Drizzle migration drift for a seed-only reorder problem, while the two-phase update keeps the existing schema and is easy to reason about.
- Fail-fast semantics are preserved. `syncQuestionsFromFiles(...)` now wraps each file with slug/path context and rethrows; it does not continue to later files after the first failed content file.

## Verification

- [x] `tests/integration/bug-regression-seed-choice-sync.integration.test.ts` seeds an existing question with `A` / `C`, then re-seeds the same slug with parser-valid `A` / `B` / `C`; the sync succeeds and persists sort orders 1 / 2 / 3 without a `choices_question_id_sort_order_uq` violation.
- [x] The same integration file verifies a failing seed file now throws a top-level error containing the failing slug/path and original cause message, and proves the later file in the batch is not inserted.
- [x] Focused runs: `DATABASE_URL=<local-test-db> pnpm test:integration -- tests/integration/bug-regression-seed-choice-sync.integration.test.ts tests/integration/bug-regression-practice-session-transaction-isolation.integration.test.ts`; `pnpm test --run scripts/seed-helpers.test.ts scripts/seed.test.ts lib/container.test.ts`.

## Related

- PR #537 (indirect — the underlying `sort_order` unique index and upsert loop predate this branch; this is a latent bug in the seed pipeline made newly relevant by the accompanying seed-sync audit), `db/schema.ts:370-373`, `scripts/seed/question-syncer.ts`, `scripts/seed/question-parser.ts:54,86`, `scripts/seed.ts`
- Found via a systematic seed/batch-idempotency audit (2026-07-01), independently re-verified by reading the upsert loop and the unique-index definition directly
