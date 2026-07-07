# DEBT-440: `attempts.selected_choice_id` Missed the 0022 Composite-FK Upgrade — a Cross-Question Choice Is Still Representable in the Permanent Attempt Record

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-05
**Resolved:** 2026-07-06

---

## Description

Migration `0022_confused_mandrill` built the `choices_id_question_id_uq` unique index specifically to enable composite `(choice_id, question_id) → choices(id, question_id)` foreign keys, and applied them to both draft and latest choice columns on `practice_session_question_states` — making a cross-question choice reference unrepresentable there. Before this debt was resolved, the same upgrade had not been applied to the **permanent** record: `attempts.selected_choice_id` used a plain `choices(id)` FK, so Postgres accepted an attempt whose selected choice belonged to a different question.

No live application path can produce the violation — `submit-answer.ts` verifies choice-question membership before insert, and finalize grades from the composite-FK-protected draft column — so this is dormant. The exposure is direct writers (repair scripts, migrations, manual SQL), which would produce an attempt whose review display shows a choice that is not among the question's choices, with `is_correct` unverifiable against the key. The target unique index already exists, so the hardening is a one-line schema change plus a small additive migration.

## Impact

None today (app-path-proof). If a direct writer ever violates it: permanently corrupt attempt rows whose grading cannot be audited. Cheap to close; classic "enforce the invariant at the layer that owns it."

## Resolution

Resolved 2026-07-06. The plain FK was swapped for the composite one, mirroring 0022's pattern for the state table:

1. Schema: change `attempts.selected_choice_id` to a composite FK `(selected_choice_id, question_id) → choices(id, question_id) ON DELETE restrict` (nullable column semantics unchanged — omitted attempts keep `selected_choice_id IS NULL`).
2. Additive migration: `0027_early_wallow.sql` pre-validates existing data with a mismatch count query, then drops `attempts_selected_choice_id_choices_id_fk`, creates the child-side `attempts_selected_choice_question_idx` supporting index, and adds `attempts_selected_choice_question_fk`.

## Verification

- `tests/integration/practice-session-schema-hardening.integration.test.ts` proves inserting an attempt whose `selected_choice_id` belongs to another question fails with an FK violation; `tests/integration/db.integration.test.ts` proves the supporting `attempts_selected_choice_question_idx` exists after migration.
- Local migration proof on 2026-07-06: fresh local DB migration to `0027_early_wallow` emitted `DEBT-440 preflight: attempts rows with cross-question selected_choice_id = 0`.
- Production deploy proof for `0027_early_wallow`: deploy `dpl_9z8mi9sufEdyaV2ed7ViocJMQ9jG` (main `5e81a7db`, 2026-07-06) logged `DEBT-440 preflight: attempts rows with cross-question selected_choice_id = 0` and completed with `migrations applied successfully`.
- Development drift proof: the Neon dev branch applied an early `0027_early_wallow.sql` before `attempts_selected_choice_question_idx` was added to the migration file, so the ledger showed `0027` applied while the child-side index was absent. `0028_repair_attempts_selected_choice_index.sql` repairs that drift idempotently with `CREATE INDEX IF NOT EXISTS`.
- Development post-Preview proof for `0028_repair_attempts_selected_choice_index` (PR #572 Preview deployment `3buS2J26KsaMQyeKgWq5JQwsBfck`, 2026-07-06, read-only query against Neon dev host label `ep-still-frog-ahx7bp6y-pooler`): `drizzle.__drizzle_migrations` count `29`, head `1783386691489`, `has0028 = true`, `pg_constraint.conname = 'attempts_selected_choice_question_fk'`, and `to_regclass('public.attempts_selected_choice_question_idx') = 'attempts_selected_choice_question_idx'`.
- Production post-promo proof for `0028_repair_attempts_selected_choice_index`: deploy `C9ESwKYPAQSfAFkFYoVgsV6PgrSw` (main `e9024197`, 2026-07-07) ran `pnpm db:migrate && pnpm build`, logged `relation "attempts_selected_choice_question_idx" already exists, skipping`, and completed with `[✓] migrations applied successfully!`, confirming the migration no-oped against Production's already-complete final 0027 shape.

## Related

- `db/migrations/0022_confused_mandrill.sql` — the pattern and the enabling unique index.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (schema lens; line-level verification against `e3853656`).
