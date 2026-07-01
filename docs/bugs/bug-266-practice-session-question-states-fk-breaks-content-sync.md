# BUG-266: New choice FKs break content sync (`pnpm db:seed`) for in-progress sessions

**Status:** Open
**Priority:** P1
**Date:** 2026-06-30

---

## Description

`db/migrations/0021_flaky_domino.sql` / `0022_confused_mandrill.sql` add `ON DELETE RESTRICT` FKs from `practice_session_question_states.latest_selected_choice_id` and `.draft_selected_choice_id` to choices, ending as composite references to `choices(id, question_id)`. `scripts/seed/question-syncer.ts`'s existing choice-deletion safety check (lines ~121-144) only queries `attempts.selectedChoiceId` to decide which stale choices are "referenced" and must not be deleted. It has no knowledge of the new table, so it does not protect against normalized-state-only choice references. The common reachable case is an in-progress exam draft (`draft_selected_choice_id`) before any attempt row exists; `latest_selected_choice_id` has the same FK class and is only missed when a latest-state row exists without a corresponding attempt reference.

## Steps to Reproduce

1. A user starts a practice/exam session and selects (drafts) an answer for question Q, choice C, without submitting it — `practice_session_question_states.draft_selected_choice_id = C`, and no `attempts` row exists yet for C.
2. A content editor changes choice C's label in the source markdown and re-runs `pnpm db:seed` (this also runs in CI with `SEED_INCLUDE_PLACEHOLDERS=true`).
3. `question-syncer.ts` computes `deleteChoiceIds` for question Q, including C, because `referencedChoiceIds` only checked `attempts` (which has no row for C).
4. `tx.delete(schema.choices).where(inArray(schema.choices.id, deleteChoiceIds))` runs. Postgres throws an uncaught `23503` foreign-key violation from `practice_session_question_states_draft_choice_question_fk` instead of the script's intended clean "Refusing to delete choice ... because it is referenced" guard, aborting the whole sync for that question. The sibling `practice_session_question_states_latest_choice_question_fk` can fail the same way for any latest-state-only reference not also covered by `attempts`.

## Root Cause

The new table/FKs were added in this PR without updating the cross-cutting choice-deletion safety check that already exists for exactly this purpose against `attempts`.

## Fix

TBD. Extend the referenced-choice-ID collection in `scripts/seed/question-syncer.ts` (and/or `computeChoiceSyncPlan`'s contract in `scripts/seed-helpers.ts`) to also query `practice_session_question_states.latest_selected_choice_id` / `.draft_selected_choice_id` for the candidate choice IDs, treating matches as referenced the same way `attempts` rows already are.

## Verification

- [ ] Integration/unit test seeding a choice label change while a `practice_session_question_states` row references the old choice via draft or latest selection
- [ ] Assert the sync either skips the deletion gracefully or raises the same clean guard message `attempts` references already produce — not a raw FK violation

## Related

- PR #537, [DEBT-425](../debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `scripts/seed/question-syncer.ts:121-174`
- `scripts/seed-helpers.ts`
- `db/migrations/0022_confused_mandrill.sql`
