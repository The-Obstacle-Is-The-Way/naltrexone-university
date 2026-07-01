# BUG-269: `FinalizeExamAnswersUseCase` decides each question's outcome from a snapshot taken before its own session-lock is acquired, so a concurrent draft save landing in that window is silently discarded

**Status:** Open
**Priority:** P1
**Date:** 2026-07-01

---

## Description

`FinalizeExamAnswersUseCase.execute` (`src/application/use-cases/finalize-exam-answers.ts`) reads the full session, including every question's state, **once**, via a plain (unlocked) query:

- Line 119-122: `const loadedSession = await tx.sessions.findByIdAndUserId(...)` — the first statement inside the outer write transaction, not a `SELECT ... FOR UPDATE`.
- If a last-second draft flush was requested (`input.finalDraftAnswer`, the BUG-254 grace-window path), `activeSession` is instead a re-fetched session from `applyFinalDraftAnswer` (lines 336-343) — but that refresh only happens *after* that one flush write, and only reflects that one question having been updated.
- Either way, `activeSession.questionStates` (line 178) becomes a single, fixed, point-in-time array that the rest of `execute` treats as ground truth for **every** question in the exam.

The loop at lines 186-245 decides each question's outcome — `answered` vs. `omitted`, and `isCorrect` — purely from that captured `state.draftSelectedChoiceId` / `state.latestSelectedChoiceId` (line 192-194), then writes the decision via `tx.attempts.insert(...)` followed by `tx.sessions.finalizeDraftAnswer(...)` (lines 197-215, 226-244). `finalizeDraftAnswer`'s `updateFn` (`src/adapters/repositories/drizzle-practice-session-repository.ts:434-442`) unconditionally overwrites `latestSelectedChoiceId`/`latestIsCorrect`/`latestAnsweredAt`/all draft fields with the caller-supplied values — it spreads `current` but never reads `current.draftSelectedChoiceId` to check whether the row changed since the outer snapshot was taken. The CAS version check in `updatePracticeSessionQuestionState` (`practice-session-question-state-updater.ts:169-189`) makes this *write* atomic, but it cannot make the *decision* correct — the decision was already made from stale data before the write's WHERE clause is even evaluated.

**Why this isn't already prevented by DEBT-426's session-wide lock:** every write to a session's question state (draft autosave, mark-for-review, submit, finalize) goes through `updatePracticeSessionQuestionState`, which acquires a `SELECT ... FOR UPDATE` lock on the parent `practice_sessions` row (`lockSessionStatus`, `practice-session-question-state-updater.ts:39-61`) before touching any child row, and — because this lock is taken inside a SAVEPOINT nested in the outer transaction — it is held for the rest of that *outer* transaction, not just the savepoint. This does serialize concurrent writers against each other **once one of them acquires the lock**. But finalize's initial snapshot (line 119) is read *before* any per-question write in its own loop acquires that lock — the lock isn't taken until the loop's first `finalizeDraftAnswer`/`saveDraftAnswer` call. So the exposed race window is real, just narrower than "the whole loop": **between finalize's snapshot read (line 119, or the post-flush refresh at line 336-343) and the moment finalize's own first per-question write acquires the session lock** (which happens on the loop's first iteration, after `fetchSessionOwnedQuestionsById` at lines 181-184 has already added at least one more round trip). Any question's draft state that changes via an external concurrent write (e.g., an in-flight autosave for a *different* question than the one covered by the BUG-254 flush) inside that window is invisible to finalize's decision loop.

## Impact

Concrete failure scenario: an exam's timer expires and the client fires the finalize call. In the window between finalize's snapshot and its first lock-acquiring write, a legitimate, already-in-flight autosave (`saveDraftAnswer`) for some other question in the same session commits and releases. Finalize's loop then reaches that question using its stale captured `draftSelectedChoiceId = null`, records an **omitted** attempt, and `finalizeDraftAnswer` clobbers the just-saved draft with the omitted outcome. No error is raised anywhere — the CAS succeeds because, from the finalize transaction's point of view, nothing is racing it *at the moment of the write*. Silent, unrecoverable loss of a real, saved exam answer.

## Resolution

Do not decide a question's finalize outcome from the outer snapshot. Either (a) have `finalizeDraftAnswer`'s `updateFn` re-derive the outcome from `current` (the freshly CAS-locked row) instead of from closure-captured values decided outside the lock, or (b) re-read each question's row (inside the same lock scope that already exists per-write) immediately before deciding its outcome, rather than relying on the one session-wide snapshot taken at the top of `execute`. Option (a) is the more localized fix and reuses the same `updateFn` current-value pattern `saveDraftAnswer` already uses correctly (lines 401-407 in the same file, which does consult `current` before deciding). Sequence this together with BUG-268 and DEBT-426 since all three touch the same lock/transaction surface in this file pair.

## Verification

An integration test: open a session-backed exam, start a finalize call, and — using a second connection — commit a `saveDraftAnswer` for a question other than the one covered by any final-draft flush, timed to land after the finalize transaction's snapshot read but before that question's per-row write. Assert the finalized attempt/state reflects the concurrently-saved answer, not `omitted`.

## Related

- PR #537, [DEBT-426](../debt/debt-426-session-wide-lock-defeats-row-concurrency.md)
- [BUG-268](./bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) — same file pair, same underlying lock/transaction surface
- `src/application/use-cases/finalize-exam-answers.ts:118-122, 178-245`
- `src/adapters/repositories/drizzle-practice-session-repository.ts:386-445`
- `src/adapters/repositories/practice-session-question-state-updater.ts:39-61`
- Found via a systematic read-path race-condition audit (2026-07-01); race-window scope independently re-verified against the actual lock-acquisition code, not accepted from the audit summary as-is
