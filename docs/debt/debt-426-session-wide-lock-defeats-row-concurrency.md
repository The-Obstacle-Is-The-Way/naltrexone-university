# DEBT-426: Session-wide pessimistic lock in practice-session-question-state-updater defeats Track A's per-row concurrency goal

**Status:** Open
**Priority:** P3
**Date:** 2026-06-30

---

## Description

`updatePracticeSessionQuestionState` (`src/adapters/repositories/practice-session-question-state-updater.ts`) takes a `SELECT ... FOR UPDATE` lock on the parent `practice_sessions` row (`lockSessionStatus`, line 56) before every single-question write, inside each retry attempt's own transaction. This was added deliberately in commit `cf2cdf21` ("Harden practice state review invariants"), with a dedicated test (`practice-session-question-state-updater-lock.test.ts`) asserting the `['lock', 'state', 'update']` call order.

The side effect: every write to *any* question's state within a session now serializes behind this one session-level lock — not just writes to that specific question's row — even though state was split into separate per-question rows specifically so concurrent updates to *different* questions would not need to contend with each other.

## Impact

The row-level `version` optimistic-CAS that the Track A design narrative (and the DEBT-425 doc) frames as "row-level optimistic concurrency" is effectively decorative under current write paths: the pessimistic session lock already serializes all writers before the CAS check can ever observe a conflict, so the "stale" retry branch is unreachable in normal operation. This functionally reproduces the same write-serialization granularity the old whole-blob CAS (BUG-188) had, just via a different mechanism (lock-wait instead of optimistic retry). If this app ever needs genuinely independent concurrent writes to different questions in the same session (multi-tab answering, parallel autosave), this lock still blocks them.

## Resolution

Decide consciously whether session-wide write serialization is actually required (e.g., to atomically guard the "session not ended" check), or whether a narrower mechanism suffices — the per-row CAS UPDATE's WHERE clause already includes an `exists (... endedAt is null)` subquery (`practice-session-question-state-updater.ts:180-186`) that atomically guards the same invariant without a separate lock.

**Correction (2026-06-30, second review pass; wording updated 2026-07-01 after BUG-267 was fixed):** simply deleting the `FOR UPDATE` call is not a safe drop-in fix. The lock also participates in the read-then-write snapshot consistency `findQuestionStateSnapshot` relies on, and removing it without a compensating design change would reopen parent/child race and error-classification issues similar to [BUG-267](../_archive/bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md)'s historical torn-read class of problem. BUG-267 itself is resolved; this debt remains only for the separate lock-granularity redesign. A real fix needs the updater redesigned around either a single joined statement (session-active check + row CAS in one round trip) or a narrower per-row lock that doesn't serialize across questions — not just lock removal. Treat this as a design task, not a quick delete.

## Verification

A concurrency test issuing two concurrent writes to two *different* questions in the same session should not block on each other once resolved (if the decision is to remove the session-wide lock).

## Related

- PR #537, [DEBT-425](../_archive/debt/debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/practice-session-question-state-updater.ts:39-61, 176-187`
- `src/adapters/repositories/practice-session-question-state-updater-lock.test.ts`
- commit `cf2cdf21`
