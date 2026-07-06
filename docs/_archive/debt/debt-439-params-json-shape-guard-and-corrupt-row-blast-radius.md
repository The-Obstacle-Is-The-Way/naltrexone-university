# DEBT-439: `params_json` Has No DB-Level Shape Guard, and One Corrupt Row Takes Down the Whole Session-History Surface

**Status:** Resolved
**Priority:** P3
**Date:** 2026-07-05
**Resolved:** 2026-07-06

---

## Description

Track A made `practice_sessions.params_json` load-bearing immutable metadata, parsed fail-loud (`parsePracticeSessionParamsJson` → `INTERNAL_ERROR` on any malformed row). Migration `0026_track_a_tail_sweep` **repaired** the one real corruption instance (the DEBT-428 double-encoded string row in dev), but before this debt was resolved the column had no `CHECK (jsonb_typeof(params_json) = 'object')` or key-presence constraint, so the exact corruption class that already occurred once remained insertable by any future direct-SQL repair, migration, or driver regression. The only writer today (`create()`, zod-validated object) was safe — the gap was purely defense against non-app writers, which is precisely how the first instance happened.

Compounding it, the fail-loud read strategy had account-wide blast radius before resolution:

- [`drizzle-practice-session-repository.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts): `findCompletedByUserId` mapped every row through the strict parser, so **one** corrupt session 500ed the user's entire history page; `findLatestIncompleteByUserId` similarly broke the practice page if the corrupt session was the active one.
- `end()` committed `ended_at` and only *then* threw from `toDomainFromRow` on a corrupt row — the caller received `INTERNAL_ERROR` for an end that actually succeeded.
- The graceful missing-state fallbacks in the read use cases (`createDefaultQuestionState` + `logger.warn` branches in `get-next-question.ts`, `get-practice-session-review.ts`, `get-completed-session-questions-with-feedback.ts`, and `practice-session-summary.ts`) were unreachable dead code against the real repository — `toOrderedDomainQuestionStates` throws before they can run — so the use-case code *read* as if it degraded per-question when it actually failed the whole query.

Fail-loud-on-corruption is a deliberate, documented Track A choice and should stay for single-session reads. The debt is (a) no DB guard for a corruption class with a prior occurrence, and (b) list-read amplification from one bad row to a whole account surface, plus the misleading dead fallbacks.

## Impact

Today: none — zero corrupt rows exist in either deployed environment (proven post-0026). If recurrence happens: one row silently written by a non-app path turns into "my history page is down" / "I can't practice" for that user, and `end()` reports failure for a success. P3 because the class has one prior real occurrence and the blast radius is a full user surface.

## Resolution

Resolved 2026-07-06.

1. **Migration:** `0027_early_wallow.sql` adds `practice_sessions_params_json_object_chk` (`CHECK (jsonb_typeof(params_json) = 'object')`) after a fail-loud preflight count. The migration deliberately stops at a top-level object CHECK; key-presence strictness remains a possible future tightening but was not required to prevent recurrence of the prior double-encoded string class.
2. **List reads degrade per-row:** `DrizzlePracticeSessionRepository.findCompletedByUserId` now skips-and-logs corrupt completed rows instead of failing the whole history page, and `findLatestIncompleteByUserId` skips-and-logs a corrupt active row by returning `null`. Single-session reads still use the strict path and fail loud. The misleading per-question default-state fallbacks in next-question navigation, review, completed-feedback, summary, and incomplete-session projection paths were removed/replaced with explicit invariant failures, so code no longer reads as if impossible partial state degrades silently.
3. **`end()` ordering:** `end()` maps the active row to the domain before the guarded `UPDATE`, so a corrupt active row cannot commit `ended_at` and then report `INTERNAL_ERROR`.

## Verification

- `tests/integration/practice-session-schema-hardening.integration.test.ts` proves a string-typed `params_json` insert fails, corrupt completed rows are skipped/logged while healthy rows still return, corrupt latest-incomplete rows are skipped/logged, and `end()` leaves `ended_at` null when strict mapping fails.
- `get-next-question-navigation.test.ts`, `get-practice-session-review.test.ts`, `get-completed-session-questions-with-feedback.test.ts`, `get-incomplete-practice-session.test.ts`, and `practice-session-summary.test.ts` pin missing normalized state as `INTERNAL_ERROR` / fail-loud behavior instead of defaulting to unanswered.
- Local migration proof on 2026-07-06: fresh local DB migration to `0027_early_wallow` emitted `DEBT-439 preflight: practice_sessions rows with non-object params_json = 0`.
- Post-deploy ledger/data proof will be recorded after the promo deploy that applies `0027_early_wallow` to Development and Production.

## Related

- Archived DEBT-428 (the repaired occurrence) and DEBT-433 (the questionIds↔state-rows cardinality invariant, resolved as documented-fail-closed — this item is its `params_json`-shape sibling with a concrete guard proposal).
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (schema + derived-data lenses; line-level verification against `e3853656`).
