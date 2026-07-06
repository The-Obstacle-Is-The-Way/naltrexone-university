# DEBT-440: `attempts.selected_choice_id` Missed the 0022 Composite-FK Upgrade — a Cross-Question Choice Is Still Representable in the Permanent Attempt Record

**Status:** Open
**Priority:** P4
**Date:** 2026-07-05

---

## Description

Migration `0022_confused_mandrill` built the `choices_id_question_id_uq` unique index specifically to enable composite `(choice_id, question_id) → choices(id, question_id)` foreign keys, and applied them to both draft and latest choice columns on `practice_session_question_states` — making a cross-question choice reference unrepresentable there. The same upgrade was never applied to the **permanent** record: [`db/schema.ts`](../../db/schema.ts#L577-L579) still declares `attempts.selected_choice_id` with a plain `references(() => choices.id, { onDelete: 'restrict' })`, so Postgres accepts an attempt whose selected choice belongs to a different question.

No live application path can produce the violation — `submit-answer.ts` verifies choice-question membership before insert, and finalize grades from the composite-FK-protected draft column — so this is dormant. The exposure is direct writers (repair scripts, migrations, manual SQL), which would produce an attempt whose review display shows a choice that is not among the question's choices, with `is_correct` unverifiable against the key. The target unique index already exists, so the hardening is a one-line schema change plus a small additive migration.

## Impact

None today (app-path-proof). If a direct writer ever violates it: permanently corrupt attempt rows whose grading cannot be audited. Cheap to close; classic "enforce the invariant at the layer that owns it."

## Resolution

Swap the plain FK for the composite one, mirroring 0022's pattern for the state table:

1. Schema: change `attempts.selected_choice_id` to a composite FK `(selected_choice_id, question_id) → choices(id, question_id) ON DELETE restrict` (nullable column semantics unchanged — omitted attempts keep `selected_choice_id IS NULL`).
2. Additive migration: pre-validate existing data (a mismatch count query — expected zero, proven by the app-path guards), then `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` per `docs/dev/migration-authoring.md` (backfill-before-constraint ordering, row-count audit trail, lock-duration awareness for the validation scan).

## Verification

- Migration applies cleanly on dev/prod data (zero pre-existing violations — verify with the pre-flight count).
- Integration test: inserting an attempt whose `selected_choice_id` belongs to another question fails with an FK violation (today: succeeds).

## Related

- `db/migrations/0022_confused_mandrill.sql` — the pattern and the enabling unique index.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (schema lens; line-level verification against `e3853656`).
