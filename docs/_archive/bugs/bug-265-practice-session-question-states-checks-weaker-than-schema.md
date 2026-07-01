# BUG-265: practice_session_question_states CHECK constraints weaker than db/schema.ts declares

**Status:** Resolved
**Severity:** P1
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Resolved:** 2026-06-30 (self-resolved by later commits on the same unmerged branch, before this bug doc's fix was ever actioned)
**Component:** DB schema / migrations — `practice_session_question_states`

---

## Description

At branch head `6bc2bd99`, `db/schema.ts` declared two CHECK constraints on `practice_session_question_states` (`latestAnswerChk`, `draftSavedChk`) with stricter logic than what migration `0023_soft_blue_marvel.sql` actually created in Postgres — the live database would have silently accepted answer/draft-state shapes the application code believed were impossible. Full original detail preserved below under Original Finding.

## Resolution

This was independently caught and fixed on the same branch (`chore/legacy-audit`, PR #537) by commit `aab81ca1` ("Tighten practice state consistency checks"), which added `db/migrations/0024_needy_jimmy_woo.sql`. That migration drops both constraints, backfills the two edge-case row shapes that would otherwise violate the tightened checks (`latest_is_correct = false` when omitted-but-marked-correct; `draft_saved_at` backfilled when a draft exists with no saved timestamp), and re-adds both constraints with the same rendered SQL logic declared by `db/schema.ts`.

Verified directly against branch head `845e8abb`: `db/schema.ts:508-518`'s `latestAnswerChk` and `draftSavedChk` clauses render to the same CHECK logic as `0024_needy_jimmy_woo.sql`'s final `ALTER TABLE ... ADD CONSTRAINT` clauses. `db/migrations/meta/0024_snapshot.json` reflects the same rendered constraint values, confirming no residual drift.

This bug doc was filed against `6bc2bd99` during an independent review pass; by the time the doc was written, two further commits (`aab81ca1`, `845e8abb`) had already landed on the branch (from concurrent work on the same PR). `aab81ca1` fixed the exact defect described by adding migration `0024`; `845e8abb` clarified invariant docs/specs afterward. An independent adversarial second-opinion review (run immediately after this doc was filed) caught that the doc was stale relative to current head and flagged it for correction — confirmed correct on verification. No new fix work was required; the bug's underlying cause never shipped to `main`.

## Root Cause (original)

`0023_soft_blue_marvel.sql` was not generated to match the final state of `db/schema.ts` at the time — either it was hand-edited after `pnpm db:generate` ran, or `db/schema.ts` was edited after the migration was generated without regenerating.

## Verification

- [x] `db/schema.ts` CHECK clauses confirmed logically identical to `0024_needy_jimmy_woo.sql`'s final rendered constraint clauses (manual diff, 2026-06-30)
- [x] `db/migrations/meta/0024_snapshot.json` reflects the same corrected constraints
- [ ] `pnpm db:generate` re-run to confirm zero pending changes (not yet run as part of this correction — recommended before merge as a final sanity check)

## Related

- PR #537, [DEBT-425](../../debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `db/schema.ts:508-518`
- `db/migrations/0023_soft_blue_marvel.sql:12-14` (original weaker version)
- `db/migrations/0024_needy_jimmy_woo.sql` (fix)
- commits `aab81ca1`, `845e8abb`
