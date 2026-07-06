# DEBT-439: `params_json` Has No DB-Level Shape Guard, and One Corrupt Row Takes Down the Whole Session-History Surface

**Status:** Open
**Priority:** P3
**Date:** 2026-07-05

---

## Description

Track A made `practice_sessions.params_json` load-bearing immutable metadata, parsed fail-loud (`parsePracticeSessionParamsJson` → `INTERNAL_ERROR` on any malformed row). Migration `0026_track_a_tail_sweep` **repaired** the one real corruption instance (the DEBT-428 double-encoded string row in dev) but added no guard against **recurrence**: the column has no `CHECK (jsonb_typeof(params_json) = 'object')` or key-presence constraint, so the exact corruption class that already occurred once remains insertable by any future direct-SQL repair, migration, or driver regression. The only writer today (`create()`, zod-validated object) is safe — the gap is purely defense against non-app writers, which is precisely how the first instance happened.

Compounding it, the fail-loud read strategy has account-wide blast radius:

- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L260-L273): `findCompletedByUserId` maps every row through the strict parser, so **one** corrupt session 500s the user's entire history page; `findLatestIncompleteByUserId` similarly breaks the practice page if the corrupt session is the active one.
- `end()` commits `ended_at` ([`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L474-L484)) and only *then* throws from `toDomainFromRow` on a corrupt row — the caller receives `INTERNAL_ERROR` for an end that actually succeeded.
- The graceful missing-state fallbacks in the read use cases (`createDefaultQuestionState` + `logger.warn` branches in `get-practice-session-review.ts`, `get-completed-session-questions-with-feedback.ts`, `practice-session-summary.ts`) are unreachable dead code against the real repository — `toOrderedDomainQuestionStates` throws before they can run — so the use-case code *reads* as if it degrades per-question when it actually fails the whole query.

Fail-loud-on-corruption is a deliberate, documented Track A choice and should stay for single-session reads. The debt is (a) no DB guard for a corruption class with a prior occurrence, and (b) list-read amplification from one bad row to a whole account surface, plus the misleading dead fallbacks.

## Impact

Today: none — zero corrupt rows exist in either deployed environment (proven post-0026). If recurrence happens: one row silently written by a non-app path turns into "my history page is down" / "I can't practice" for that user, and `end()` reports failure for a success. P3 because the class has one prior real occurrence and the blast radius is a full user surface.

## Resolution

1. **Migration:** add `CHECK (jsonb_typeof(params_json) = 'object')` (data is already 100% conformant post-0026, so this validates instantly; follow `docs/dev/migration-authoring.md` for ordering/audit norms). Optionally also require the key set (`params_json ? 'questionIds'` etc.) — decide how strict at review.
2. **List reads degrade per-row:** `findCompletedByUserId` (and the latest-incomplete lookup) should skip-and-log a row that fails to parse instead of failing the query; single-session reads stay fail-loud. Remove or make reachable the dead per-question fallbacks so code and behavior agree.
3. **Fix the `end()` ordering:** map the row to domain *before* the UPDATE (or catch the mapping failure and still report the committed end), so a corrupt-row mapping failure cannot misreport a successful end.

## Verification

- Migration test: inserting a string-typed / keyless `params_json` row fails the CHECK.
- Repository test: `findCompletedByUserId` over N healthy rows + 1 corrupt row returns N sessions and logs the skip (today: throws).
- `end()` test: corrupt-row mapping failure does not leave the caller believing the end failed when `ended_at` committed.

## Related

- Archived DEBT-428 (the repaired occurrence) and DEBT-433 (the questionIds↔state-rows cardinality invariant, resolved as documented-fail-closed — this item is its `params_json`-shape sibling with a concrete guard proposal).
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (schema + derived-data lenses; line-level verification against `e3853656`).
