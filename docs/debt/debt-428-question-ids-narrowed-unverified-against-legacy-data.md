# DEBT-428: questionIds validation narrowed to strict zUuid + count-match without auditing existing data

**Status:** Open
**Priority:** P3
**Date:** 2026-06-30

---

## Description

`practice-session-params.ts`'s `questionIds` field was tightened from `z.array(z.string().min(1))` to `z.array(zUuid).min(1)` plus a new `count === questionIds.length` refine, applied via `parsePracticeSessionParamsJson(row.paramsJson, 'INTERNAL_ERROR')` on every read of every `practice_sessions` row (`findByIdAndUserId`, `findLatestIncompleteByUserId`, `findCompletedByUserId`).

## Impact

Any pre-existing row that doesn't conform to the new stricter shape (a non-UUID-format legacy `questionId`, an empty `questionIds` array, or a historical `count`/`questionIds.length` mismatch from an old bug) now throws `INTERNAL_ERROR` on read, where the old looser schema parsed it successfully.

Post-deploy proof on 2026-07-02 turned this from unverified risk into concrete Development cleanup: Production has zero affected rows, but Development has one ended tutor session whose `params_json` is a double-encoded JSON string rather than a top-level object. A follow-up read-only inspection on 2026-07-02 identified it as session `00000000-0000-4000-8000-000000000244` for user `3955ed2e-9034-4943-ad15-04cd79daa568`, `mode='tutor'`, `started_at='2026-01-01T00:00:00.000Z'`, `ended_at='2026-01-01T00:02:00.000Z'`. It has zero normalized `practice_session_question_states` rows and one linked attempt row. The row therefore has no top-level `questionIds` as far as JSONB operators and the current parser are concerned, and the embedded string contains legacy malformed question IDs. Object-shaped sessions in both environments have zero duplicate and zero dangling `questionIds`.

**Correction (2026-06-30, second review pass):** the `questionIds` *uniqueness* refine (`new Set(questionIds).size === questionIds.length`) is **not** new — it was already present and enforced on `main` before this PR; this PR only added the `zUuid` format check, `.min(1)`, and the `count === questionIds.length` refine. A legacy row with duplicate `questionIds` would already have failed to parse before this PR too, so uniqueness itself is not a newly introduced risk here. What *is* worth tracking is a downstream interaction: migration `0021`'s backfill `INSERT` uses `ON CONFLICT (practice_session_id, question_id) DO NOTHING`, so a row with duplicate `questionIds` (if one somehow exists despite the app-level guard, e.g. from a pre-Zod-refine era or a direct DB write) would backfill fewer state rows than `questionIds.length`, producing a `rows.length < params.questionIds.length` mismatch at read time — a different, migration-level manifestation of the same underlying data-quality question. Tracked as an explicit scenario under [DEBT-427](./debt-427-migration-fk-ordering-and-unaudited-cleanup.md) rather than duplicated here.

## Resolution

Clean the single malformed Development row deliberately. Preferred disposition: delete the ended legacy seed artifact in a one-shot Development cleanup; the attempt FK is `ON DELETE SET NULL`, so cleanup can preserve the answer event while removing the unreadable session row. Only rewrite the double-encoded `params_json` into a valid current object shape if the owner wants this exact seed artifact kept for diagnostics. Production needs no remediation based on the 2026-07-02 proof. Do not add parser tolerance for double-encoded `params_json` unless production data proves it is necessary; this is internal dev residue, not an external compatibility surface.

Current live code can read this row if a Development user/history path selects that completed session (`findByIdAndUserId`, `findCompletedByUserId`, or review/summary paths using the practice-session repository). It will fail loudly in `parsePracticeSessionParamsJson()` because the top-level JSONB value is a string, not the required object. That is the intended failure mode until the dev artifact is cleaned; it should not be converted into permanent compatibility logic.

## Verification

Current proof from 2026-07-02:

| Target | Sessions failing current `questionIds` shape | Object-shaped sessions with duplicate `questionIds` | Object-shaped sessions with dangling `questionIds` |
|---|---:|---:|---:|
| Development (`ep-still-frog`) | 1 (`00000000-0000-4000-8000-000000000244`) | 0 | 0 |
| Production (`ep-withered-cell`) | 0 | 0 | 0 |

This debt clears when the Development count is zero, or if the owner explicitly accepts the ended dev artifact as permanent non-production residue with a documented reason.

## Related

- PR #537, [DEBT-425](../_archive/debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/practice-session-params.ts:24-32`
