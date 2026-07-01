# DEBT-434: Migration 0021's backfill copies `params_json.questionStates` into the new table but never strips the now-dead JSON copy, leaving diverging duplicate data on disk

**Status:** Open
**Priority:** P4
**Date:** 2026-07-01

---

## Description

`0021_flaky_domino.sql:27-103` backfills `practice_session_question_states` by reading each legacy row's `params_json -> 'questionStates'` array, but only ever `INSERT`s from it — it never strips, nulls, or otherwise marks that key on the source `practice_sessions.params_json` row. Per `docs/debt/debt-425-legacy-compatibility-tolerances-audit.md`, application code (`practice-session-params.ts`, the session-creation path) now ignores `questionStates` in `params_json` entirely going forward — but every pre-Track-A row still carries the original per-question blob verbatim in `params_json`, frozen at whatever state it was in at migration time.

## Impact

From the moment the application writes any new question-state change (via `practice_session_question_states`), that row's `params_json.questionStates` is stale and will silently diverge from the source of truth with every subsequent answer/draft/review-mark write — nothing updates it, and nothing marks it as dead. Low runtime risk (the app itself never reads it again), but a real footgun for anyone who queries `params_json` directly outside the application layer — analytics, a future migration author skimming existing data for a pattern, or support tooling — who could reasonably assume a JSON column still reflects current state and draw wrong conclusions from an answer that's actually been changed since.

## Resolution

Low priority, no urgency: a follow-up migration could null out or delete the `questionStates` key from `params_json` for all rows once the normalized table is confirmed to be the sole source of truth in production (i.e., after DEBT-425's post-deploy verification closes). Until then, at minimum leave a comment near the backfill INSERT noting that the source JSON is intentionally left untouched and is expected to be stale after migration — so a future reader doesn't mistake "we didn't clean this up" for "this is still live data."

## Verification

If the follow-up cleanup migration ships, verify `params_json ? 'questionStates'` is false (or the key is present but empty/nulled per whatever approach is chosen) for all `practice_sessions` rows post-migration, and that no application code path reads it (already true today per DEBT-425, but worth re-confirming at cleanup time).

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `db/migrations/0021_flaky_domino.sql:27-103`
- Found via a systematic derived-data consistency audit (2026-07-01)
- Also noted in the same audit, not filed separately as too minor to track: `scripts/seed/placeholder-archiver.ts`'s `archivePlaceholderQuestions` unconditionally bumps `updatedAt` on every `pnpm db:seed` run for all `slug LIKE 'placeholder-%'` rows even when nothing else changed — cosmetic non-idempotency with no functional impact, not worth a tracked item on its own.
