# DEBT-433: The question-order invariant between `practice_sessions.params_json.questionIds` and `practice_session_question_states.position` is enforced only at read time, not by the database

**Status:** Resolved
**Priority:** P3
**Date:** 2026-07-01
**Resolved:** 2026-07-03

---

## Description

A practice session's ordered question list is represented twice: as an array (`questionIds`) inside `practice_sessions.params_json`, and as a `position` integer column (`db/schema.ts:471`, unique per session via `sessionPositionUq`) on each `practice_session_question_states` row. No database constraint ties these two representations together — the unique index only prevents two state rows from sharing the same position within a session; it does not (and structurally cannot, since one side lives in JSON and the other in a relational column) guarantee that positions form a contiguous `0..N-1` sequence matching `questionIds`' order and length.

The only place this invariant is enforced is at read time: `toOrderedDomainQuestionStates` (`src/adapters/repositories/drizzle-practice-session-repository.ts:84-108`) throws `ApplicationError('INTERNAL_ERROR', ...)` if the state-row count or `position` values don't line up index-for-index with `params.questionIds`.

## Impact

Any write path that touches `params_json.questionIds` (a reorder, an add/remove) without a matching, transactionally-coupled update to the corresponding `practice_session_question_states` rows' `position` values makes every subsequent read of that session throw `INTERNAL_ERROR` (a 500-class failure) instead of degrading gracefully or being rejected up front. Today the application itself has no such write path (per DEBT-425, `params_json` is intended to be immutable selection metadata post-creation) — the realistic exposure is an admin/support script or a future migration that edits `params_json` directly without also touching the new table, since nothing in the schema would stop that from producing an inconsistent pair.

## Resolution

Resolved by documenting the accepted invariant coupling at the code definition sites rather than adding partial database enforcement. No DB-level fix fully closes this gap given the JSON/relational split (a `CHECK` constraint can't reason about another table's contents), and the current loud `INTERNAL_ERROR` from `toOrderedDomainQuestionStates` remains the correct failure mode for corrupt session data.

The code now cross-references both sides:

- `src/adapters/repositories/practice-session-params.ts` documents that `questionIds` order is mirrored by `practice_session_question_states.position`, and direct migrations/scripts must update both sides transactionally.
- `db/schema.ts` documents the same coupling at `PracticeSessionParams.questionIds`, `practiceSessionQuestionStates.position`, and `sessionPositionUq`, including the read-time `INTERNAL_ERROR` guard.

## Verification

Verified by code review of the cross-references. No behavior change was made; enforcement remains the existing read-time guard in `toOrderedDomainQuestionStates`.

## Related

- PR #537
- `db/schema.ts:457-495` (`position`, `sessionPositionUq`)
- `src/adapters/repositories/practice-session-params.ts` (`questionIds` parsing)
- `src/adapters/repositories/drizzle-practice-session-repository.ts:84-108`
- Found via a systematic derived-data consistency audit (2026-07-01), independently re-verified against the schema and mapper code directly
