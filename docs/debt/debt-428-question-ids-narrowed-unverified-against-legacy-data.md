# DEBT-428: questionIds validation narrowed to strict zUuid + count-match without auditing existing data

**Status:** Open
**Priority:** P3
**Date:** 2026-06-30

---

## Description

`practice-session-params.ts`'s `questionIds` field was tightened from `z.array(z.string().min(1))` to `z.array(zUuid).min(1)` plus a new `count === questionIds.length` refine, applied via `parsePracticeSessionParamsJson(row.paramsJson, 'INTERNAL_ERROR')` on every read of every `practice_sessions` row (`findByIdAndUserId`, `findLatestIncompleteByUserId`, `findCompletedByUserId`).

## Impact

Any pre-existing row that doesn't conform to the new stricter shape (a non-UUID-format legacy `questionId`, an empty `questionIds` array, or a historical `count`/`questionIds.length` mismatch from an old bug) now throws `INTERNAL_ERROR` on read, where the old looser schema parsed it successfully. The DEBT-425 audit's data-proof table only checked missing `questionStates`, missing draft fields, and oversized `draftCumulativeMs` — it never checked this specific shape dimension against the 124 dev-environment sessions, so this is an unverified residual risk (low risk in production, which has zero sessions today per the same audit).

**Correction (2026-06-30, second review pass):** the `questionIds` *uniqueness* refine (`new Set(questionIds).size === questionIds.length`) is **not** new — it was already present and enforced on `main` before this PR; this PR only added the `zUuid` format check, `.min(1)`, and the `count === questionIds.length` refine. A legacy row with duplicate `questionIds` would already have failed to parse before this PR too, so uniqueness itself is not a newly introduced risk here. What *is* worth tracking is a downstream interaction: migration `0021`'s backfill `INSERT` uses `ON CONFLICT (practice_session_id, question_id) DO NOTHING`, so a row with duplicate `questionIds` (if one somehow exists despite the app-level guard, e.g. from a pre-Zod-refine era or a direct DB write) would backfill fewer state rows than `questionIds.length`, producing a `rows.length < params.questionIds.length` mismatch at read time — a different, migration-level manifestation of the same underlying data-quality question. Tracked as an explicit scenario under [DEBT-427](./debt-427-migration-fk-ordering-and-unaudited-cleanup.md) rather than duplicated here.

## Resolution

Run a one-off query against dev (and prod, before any future sessions accumulate) counting rows where `questionIds` fails the new schema, before this PR ships. If any exist, either backfill/correct them or add the same kind of defensive normalization Track A already applies to other legacy fields.

## Verification

Add the query's result to the DEBT-425 data-proof table; zero affected rows clears this debt outright, any non-zero count needs a remediation plan before merge.

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/practice-session-params.ts:24-32`
