# DEBT-431: `practice_session_question_states` has no index on `question_id` or either choice-FK column, forcing sequential scans on every seed reference check and choice delete

**Status:** Open
**Priority:** P3
**Date:** 2026-07-01

---

## Description

`practice_session_question_states` (`db/schema.ts:457-495`) declares two unique indexes — `sessionQuestionUq` on `(practice_session_id, question_id)` and `sessionPositionUq` on `(practice_session_id, position)` — both leading with `practice_session_id`. There is no index with `question_id`, `latest_selected_choice_id`, or `draft_selected_choice_id` as a leading column, even though all three are foreign keys (`db/migrations/0021_flaky_domino.sql:21-24`, tightened to composite FKs in `0022_confused_mandrill.sql:20-25`), and two of them (`latest_selected_choice_id`, `draft_selected_choice_id`) carry `ON DELETE RESTRICT`. Contrast with `attempts` (same file, ~line 490+), which explicitly indexes `questionIdIdx` for this exact reason.

Missing FK-supporting indexes on the *referencing* side matter specifically because Postgres must scan the referencing table to check for dependents whenever a row on the *referenced* side (`choices`, `questions`) is deleted or a candidate key column is updated — without an index, that check is a sequential scan of `practice_session_question_states`.

## Impact

Every content-sync choice deletion (`scripts/seed/question-syncer.ts:199-203`, and its reference-check query at ~lines 142-167 that now also queries this table per BUG-266's fix) forces a full sequential scan of `practice_session_question_states` to determine whether a candidate choice is still referenced. This is currently cheap only because the table is small (0 production sessions per DEBT-425); it will degrade linearly as real session volume accumulates, and it directly widens the practical blast radius of [BUG-270](../_archive/bugs/bug-270-seed-choice-resort-can-violate-sort-order-unique-index.md)'s failure mode by making every seed run's reference-check step slower than necessary on a growing table.

## Resolution

Add supporting indexes: one on `question_id` alone (or confirm the composite FK's leading column already gets index support from `sessionQuestionUq`'s `(practice_session_id, question_id)` — it does not, since `question_id` isn't the leading column there), and one each on `latest_selected_choice_id` and `draft_selected_choice_id` (or a single index covering both if query patterns allow). This is a low-risk additive migration (new indexes, no constraint/data changes) that can ship independently of any other Track A follow-up work.

## Verification

`EXPLAIN ANALYZE` the seed reference-check query (or the equivalent `DELETE FROM choices WHERE id = ...` path) before and after adding the indexes against a `practice_session_question_states` table seeded with a representative row count; confirm the plan shifts from a sequential scan to an index scan.

## Related

- PR #537, [BUG-270 (archived)](../_archive/bugs/bug-270-seed-choice-resort-can-violate-sort-order-unique-index.md), [BUG-266 (archived)](../_archive/bugs/bug-266-practice-session-question-states-fk-breaks-content-sync.md)
- `db/schema.ts:457-495`
- Found via a systematic migration schema-evolution audit (2026-07-01), independently re-verified against the current schema definition
