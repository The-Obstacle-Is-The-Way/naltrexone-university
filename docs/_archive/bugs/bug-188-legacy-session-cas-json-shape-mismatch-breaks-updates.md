# BUG-188: Legacy Session CAS JSON Shape Mismatch Breaks Updates

**Status:** Fixed
**Priority:** P2
**Date:** 2026-03-03

---

## Description

Legacy practice sessions persisted without `questionStates` can fail all CAS updates, making answer/mark writes impossible for affected sessions.

Observed behavior:
- For legacy rows whose `params_json` omits `questionStates`, session state updates can repeatedly fail and end as `INTERNAL_ERROR`.
- In submit flow, attempt rollback is attempted after session update failure, so user submission fails.

Expected behavior:
- Legacy-compatible parsing should not make rows permanently non-updatable.

## Steps to Reproduce

1. Use a `practice_sessions` row where `params_json` has `questionIds` but no `questionStates` key.
2. Open that session and submit an answer (or toggle mark-for-review).
3. Observe repeated CAS miss and eventual `INTERNAL_ERROR`.

## Root Cause

Tracer-bullet path:
1. Persisted contract allows optional `questionStates` in [schema.ts](../../../db/schema.ts#L91).
2. Parser normalizes missing `questionStates` into a full array in [practice-session-params.ts](../../../src/adapters/repositories/practice-session-params.ts#L94) through [practice-session-params.ts](../../../src/adapters/repositories/practice-session-params.ts#L118).
3. CAS update compares DB `params_json` to normalized `expectedParamsJson` in [practice-session-question-state-updater.ts](../../../src/adapters/repositories/practice-session-question-state-updater.ts#L60) and [practice-session-question-state-updater.ts](../../../src/adapters/repositories/practice-session-question-state-updater.ts#L71).
4. A row without `questionStates` will not equal normalized JSON that includes it, so each CAS attempt misses and retries.
5. After retry exhaustion, updater throws `INTERNAL_ERROR` in [practice-session-question-state-updater.ts](../../../src/adapters/repositories/practice-session-question-state-updater.ts#L89), surfacing through submit flow after rollback path in [submit-answer.ts](../../../src/application/use-cases/submit-answer.ts#L208).

## Fix

Implemented in `bug-fix-186-187-188`:
- CAS updater now compares against the raw persisted `params_json` snapshot instead of a normalized re-serialization.
- `DrizzlePracticeSessionRepository` now provides a snapshot (`session` + `rawParamsJson`) to the CAS updater so one read can drive both domain logic and legacy-compatible CAS comparison.
- This preserves legacy-row compatibility while keeping normalized domain behavior for mutation output.

Code changes:
- [practice-session-question-state-updater.ts](../../../src/adapters/repositories/practice-session-question-state-updater.ts)
- [drizzle-practice-session-repository.ts](../../../src/adapters/repositories/drizzle-practice-session-repository.ts)
- [drizzle-practice-session-repository.test.ts](../../../src/adapters/repositories/drizzle-practice-session-repository.test.ts)

## Verification Notes (Audit #11)

**Confirmed real.** Verified at line level 2026-03-03.

Full CAS failure trace: Read normalizes missing `questionStates` into `[{questionId, markedForReview:false, ...}, ...]`. `toPracticeSessionParamsJson(existing)` serializes this normalized form as `expectedParamsJson`. DB column still holds original JSON without `questionStates` key. WHERE clause `eq(practiceSessions.paramsJson, expectedParamsJson)` fails because `{count,tagSlugs,difficulties,questionIds}` !== `{count,tagSlugs,difficulties,questionIds,questionStates:[...]}`. All 3 retry iterations fail identically. Row is permanently bricked.

**Impact caveat:** Only affects rows where `params_json` was persisted without `questionStates`. All current session creation includes this field. Impact depends on whether legacy rows exist from before the feature was added.

## Verification

- [x] Unit test added
- [x] Integration test added
- [x] Manual verification
- [x] Code-level tracer-bullet verified (Audit #11, 2026-03-03)

## Related

- Affected write paths: answer persistence and mark-for-review persistence.
