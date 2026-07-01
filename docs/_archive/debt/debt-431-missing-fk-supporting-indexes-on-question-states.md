# DEBT-431: `practice_session_question_states` has no index on `question_id` or either choice-FK column, forcing sequential scans on every seed reference check and choice delete

**Status:** Resolved
**Priority:** P3
**Date:** 2026-07-01
**Resolved:** 2026-07-01

---

## Description

At filing, `practice_session_question_states` (`db/schema.ts:457-495` before the fix) declared two unique indexes — `sessionQuestionUq` on `(practice_session_id, question_id)` and `sessionPositionUq` on `(practice_session_id, position)` — both leading with `practice_session_id`. There was no index with `question_id`, `latest_selected_choice_id`, or `draft_selected_choice_id` as a leading column, even though all three are foreign keys (`db/migrations/0021_flaky_domino.sql:21-24`, tightened to composite FKs in `0022_confused_mandrill.sql:20-25`), and two of them (`latest_selected_choice_id`, `draft_selected_choice_id`) carry `ON DELETE RESTRICT`. Contrast with `attempts`, which explicitly indexes `questionIdIdx` for this exact reason.

Missing FK-supporting indexes on the *referencing* side matter specifically because Postgres must scan the referencing table to check for dependents whenever a row on the *referenced* side (`choices`, `questions`) is deleted or a candidate key column is updated — without an index, that check is a sequential scan of `practice_session_question_states`.

## Impact

Before resolution, every content-sync choice deletion (`scripts/seed/question-syncer.ts:199-203`, and its reference-check query at ~lines 142-167 that also queries this table per BUG-266's fix) forced a full sequential scan of `practice_session_question_states` to determine whether a candidate choice was still referenced. This was cheap only because the table was small (0 production sessions per DEBT-425); it would have degraded linearly as real session volume accumulated, and it directly widened the practical blast radius of [BUG-270](../bugs/bug-270-seed-choice-resort-can-violate-sort-order-unique-index.md)'s failure mode by making every seed run's reference-check step slower than necessary on a growing table.

## Resolution

Resolved on PR #537 by additive migration `0025_worthless_junta.sql` and matching `db/schema.ts` indexes:

- `practice_session_question_states_question_id_idx` on `question_id`
- `practice_session_question_states_latest_choice_question_idx` on `(latest_selected_choice_id, question_id)`
- `practice_session_question_states_draft_choice_question_idx` on `(draft_selected_choice_id, question_id)`

The migration changes no data and no constraints; it only adds the referencing-side indexes needed for efficient FK validation and seed reference checks.

## Verification

- `tests/integration/db.integration.test.ts` asserts all three indexes exist in the migrated database.
- `pnpm db:generate` produced the matching SQL and Drizzle snapshot from the schema definition.

## Related

- PR #537, [BUG-270 (archived)](../bugs/bug-270-seed-choice-resort-can-violate-sort-order-unique-index.md), [BUG-266 (archived)](../bugs/bug-266-practice-session-question-states-fk-breaks-content-sync.md)
- `db/schema.ts:443-531`
- `db/migrations/0025_worthless_junta.sql`
- Found via a systematic migration schema-evolution audit (2026-07-01), independently re-verified against the current schema definition
