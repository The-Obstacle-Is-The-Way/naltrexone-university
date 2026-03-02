# BS-038: Practice Engine Question Ordering Audit and Simplification Plan

**Date:** 2026-03-02  
**Triggered by:** Quick Practice feels clustered and "not random"  
**Scope:** End-to-end ordering behavior across session, quick-practice, and review flows  
**Related:** Issue #54, SPEC-013, SPEC-024, `selectNextQuestionId`, `shuffleWithSeed`

---

## 1. Context in the Practice Engine

This brainstorming doc is intentionally aligned with the Practice Engine SSOT docs:
- `docs/practice-engine/practice-modes.md`
- `docs/practice-engine/architecture-layers.md`
- `docs/practice-engine/retry-logic.md`
- `docs/specs/master_spec.md` (Case B for `GetNextQuestion`)

The core architectural shape is correct:
- Session modes (`tutor`/`exam`) are snapshot-based (`questionIds` persisted at session start).
- Quick Practice is stateless and filter-driven (`executeForFilters`).
- Review paths are either session-sequenced (session review) or single-question (history/bookmarks/dashboard review).

The issue is not broad architecture failure. It is policy ambiguity in the filter path plus one concrete ordering bug.

---

## 2. First-Principles Policy (What Should Be True)

For question ordering, the system should optimize for:

1. Interleaving for broad study pools (especially unanswered/full-pool work).
2. Stable behavior within a short study window (refresh should not feel chaotic).
3. Explicit, understandable rules per mode/filter (not accidental behavior from DB order).
4. Immutable historical review order for completed sessions.
5. No hidden coupling between repository ordering and learning behavior.

---

## 3. Code Truth (Current Behavior)

### 3.1 Session flows are correct

`StartPracticeSessionUseCase` does:
1. `listPublishedCandidateIds(...)`
2. `shuffleWithSeed(...)`
3. `slice(0, count)`

That is the correct order (shuffle-then-slice), and applies equally to tutor/exam and filtered/unfiltered sessions.

### 3.2 Quick Practice flow has a real gap

`GetNextQuestionUseCase.executeForFilters()` currently:
1. Loads candidate IDs in repository order (`createdAt desc`, `id asc`).
2. Loads most recent attempt timestamps for those IDs.
3. Calls `selectNextQuestionId(candidateIds, attemptHistory)` with **unshuffled** candidates.

`selectNextQuestionId` rule is:
1. first unattempted in candidate order,
2. else oldest answered timestamp.

This means repository order leaks directly into selection.

### 3.3 Status-filter semantics are not all equivalent

This is where earlier drafts were too coarse:

- `unanswered`: all candidates are unattempted by definition, so "first unattempted" means first row in candidate order. This is the strongest clustering bug.
- `incorrect`: all candidates are previously attempted by definition (latest attempt incorrect), so selection usually uses oldest-timestamp fallback; candidate order only matters on equal-timestamp ties.
- `bookmarked`: mixed; if unattempted bookmarks exist, candidate order matters strongly. If all bookmarked are attempted, behavior is mostly oldest-timestamp with tie sensitivity.

### 3.4 Review/reattempt ordering paths

- Session review preserves original session order (correct).
- History Questions tab and bookmark/dashboard question links are single-question review routes; sequence ordering is N/A there.
- Choice-order shuffling is consistently handled via `buildShuffledChoiceViews` on relevant output paths.

---

## 4. Scenario Checklist (Pass/Fail)

| # | Scenario | Status | Notes |
|---|---|---|---|
| 1 | Session with ALL questions (no tag filter) | PASS | Shuffle full pool then slice in session creation. |
| 2 | Session with SUBSET (tag-filtered) | PASS | Filter first, then shuffle within subset. |
| 3 | Tutor session (N questions) shuffle-then-slice | PASS | Correct pipeline already implemented. |
| 4 | Exam session (N questions) parity | PASS | Same ordering pipeline as tutor. |
| 5 | Quick Practice - Unanswered | FAIL | DB order leaks directly into "first unattempted". |
| 6 | Quick Practice - Incorrect | FAIL (policy precision) | Same code path, but usually oldest-timestamp fallback; DB order mostly tie-break only. |
| 7 | Quick Practice - Bookmarked | FAIL (mixed) | Order-sensitive when unattempted exists; otherwise mostly fallback/tie behavior. |
| 8 | Single-question review (bookmarks/history click) | PASS | Ordering N/A; choice shuffling still applies. |
| 9 | Session review/history session review | PASS | Preserves persisted `questionIds` order; no reshuffle. |
| 10 | All-answered fallback behavior | PASS with caveat | Timestamp-driven, but equal timestamps use candidate order as tie-break. |

---

## 5. What Was Incorrect or Sloppy in Prior Drafts

1. Treating paths 5/6/7 as identical in practical effect was imprecise.
2. Saying fallback is fully order-independent was too strong (ties are order-sensitive).
3. Claiming bookmark reattempt has a "next -> quick practice" transition is not accurate in current wiring.
4. Code sketch used `hashString` directly even though it is private to `shuffle.ts`.

---

## 6. Recommended Direction (Robust, Minimal-Slop)

### 6.1 Keep architecture, make policy explicit

Do not move randomization into repositories and do not create hidden Quick Practice sessions.

Keep boundaries:
- Repository: fetch candidates
- Application use case: orchestrate
- Domain service: deterministic ordering/selection policy

### 6.2 Define explicit filter-mode selection policy

Proposed policy contract for quick practice:

- `unanswered`: apply deterministic candidate permutation first, then select first unattempted.
- `incorrect`: keep "oldest last-attempt wins" as primary rule (SPEC-consistent), add deterministic tie-break to avoid DB-order artifacts.
- `bookmarked`: same rule set as generic filter mode; deterministic permutation still helps when unattempted bookmarks exist.

This removes implicit behavior and keeps spec semantics intact.

### 6.3 Minimal implementation sketch

In `GetNextQuestionUseCase.executeForFilters()`:
1. compute a stable daily seed without exposing private hash helpers:
   - `const now = this.now();`
   - `const utcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());`
   - `const seed = createSeed(userId, utcDayStartMs);`
2. `const orderedCandidateIds = shuffleWithSeed(candidateIds, seed);`
3. pass `orderedCandidateIds` to `selectNextQuestionId`.

This is compile-safe with current public APIs.

### 6.4 Why this is cleaner

- No repository contract change.
- No extra persistence model.
- No controller/frontend changes.
- Deterministic and testable (`now()` injection needed in `GetNextQuestionUseCase`, mirroring `StartPracticeSessionUseCase`).
- Preserves existing domain service contracts while making candidate ordering intentional.

---

## 7. Complexity Reduction Option (If We Want a Cleaner Core)

If we want to reduce policy slop long-term, add a domain-level policy function and remove hidden assumptions from the use case:

`selectNextQuestionIdByPolicy({ candidateIds, attemptHistory, mode, seed })`

Where `mode` is a filter selection policy enum (not UI mode).  
This makes behavior explicit and centrally testable, but it is a refactor, not required for immediate fix.

---

## 8. Verification Plan

### 8.1 Unit tests (required)

Add/adjust `get-next-question.test.ts` cases:
- `unanswered` picks from shuffled candidate order, not raw repository order.
- same user + same UTC day => same selected question for unchanged history.
- day boundary changes candidate permutation.
- all-attempted fallback still chooses oldest timestamp.
- equal-timestamp fallback uses deterministic tie-break (documented expectation).

### 8.2 Manual checks

1. Quick Practice `unanswered`: first 5-10 questions should be more interleaved across sources.
2. Quick Practice `incorrect`: verify oldest-answered behavior still feels stable; no regressions in retry cadence.
3. Quick Practice `bookmarked`: verify no obvious insertion-order clustering when unattempted bookmarks exist.
4. Tutor/exam/session review: verify no behavior changes.

---

## 9. Practice-Engine Doc Alignment Follow-ups

After code changes, align wording in docs:
- `docs/practice-engine/frontend-layer.md` currently says "random question" for quick practice.
- `docs/practice-engine/practice-modes.md` currently documents first-unattempted/oldest fallback.

Both can remain true, but should be made precise:
- deterministic seeded ordering + selection policy, not ad hoc randomness.

---

## 10. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-02 | Reframed BS-038 from "one bug" to policy-and-ordering audit | Needed alignment with overall practice-engine architecture and specs |
| 2026-03-02 | Keep current architecture; fix filter ordering in use case | Clean Architecture boundaries remain correct |
| 2026-03-02 | Prefer explicit per-filter policy language | Prevents future drift and "slop by accident" behavior |
