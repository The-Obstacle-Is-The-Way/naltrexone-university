# DEBT-268: Quick Practice Ordering Policy Alignment

**Status:** Resolved (2026-03-02)
**Priority:** P2
**Date:** 2026-03-02
**Owner:** Practice Engine
**Related:** [BS-038](../_archive/brainstorming/bs-038-quick-practice-question-ordering-not-randomized.md), [Ordering Policy](../practice-engine/ordering-policy.md), Issue #54, SPEC-013, SPEC-024

---

## Executive summary

`GetNextQuestionUseCase.executeForFilters()` passed repository-returned candidates directly into `selectNextQuestionId()` without shuffling.
`selectNextQuestionId()` is intentionally order-dependent (`first unattempted`, then `oldest answeredAt`), so ordering policy was inherited from repository order.

Important correction: the leak was not raw table insertion order; it was explicit repository ordering (`ORDER BY questions.createdAt DESC, questions.id ASC`) from `DrizzleQuestionRepository.listPublishedCandidateIds()`.

This violated [ordering-policy.md](../practice-engine/ordering-policy.md) Section 3.3, which requires a daily-seeded shuffle before Quick Practice selection.

## Resolution

Added `now: () => Date = () => new Date()` as a fourth constructor parameter to `GetNextQuestionUseCase`, and applied daily-seeded `shuffleWithSeed` in `executeForFilters` before calling `selectNextQuestionId`. All three instantiation sites updated. Six unit tests cover daily-seeded shuffle, same-day stability, day-boundary rotation, oldest-fallback regression, equal-timestamp tie-break, and all three filter pools.

## Tracer-bullet audit (vertical + horizontal, verified 2026-03-02)

| # | Scenario | Pass/Fail | Verified path | Notes |
|---|----------|-----------|---------------|-------|
| 1 | Session with all questions (no tag filter) | **Pass** | `StartPracticeSessionUseCase.execute` -> `listPublishedCandidateIds` -> `shuffleWithSeed(...).slice(...)` | Full pool is shuffled before slice. |
| 2 | Session with subset (tag-filtered) | **Pass** | `listPublishedCandidateIds` applies filters first; `StartPracticeSessionUseCase` shuffles returned subset | Filter-then-shuffle behavior is correct. |
| 3 | Tutor session (N questions) | **Pass** | Same `StartPracticeSessionUseCase` path | Shuffle-then-slice is correct. |
| 4 | Exam session (N questions) | **Pass** | Same `StartPracticeSessionUseCase` path | Tutor/exam parity confirmed. |
| 5 | Quick Practice - unanswered | **Pass** | `GetNextQuestionUseCase.executeForFilters` -> `shuffleWithSeed(candidates, dailySeed)` -> `selectNextQuestionId(shuffled, ...)` | Daily-seeded shuffle applied before selection. |
| 6 | Quick Practice - incorrect | **Pass** | Same as #5 | Same shuffled path. |
| 7 | Quick Practice - bookmarked | **Pass** | Same as #5 | Same shuffled path. |
| 8 | Single-question paths (bookmark/history/dashboard question open) | **Pass** | `getQuestionBySlug` + `GetPreviousAttemptUseCase` | Choice order still uses `buildShuffledChoiceViews`. Question ordering N/A. |
| 9 | Session review/history review ordering | **Pass** | `GetPracticeSessionReviewUseCase` iterates persisted `session.questionIds`; review nav uses returned row order | Preserves original session order; no reshuffle. |
| 10 | All-attempted fallback behavior | **Pass (with tie nuance)** | `selectNextQuestionId` oldest timestamp fallback | Shuffling candidates does not change winner when oldest timestamp is unique; equal-timestamp ties are intentionally order-based. |

## Severity by Quick Practice filter

| Filter | Practical impact |
|--------|------------------|
| `unanswered` | **High** - 100% unattempted pool, so candidate order fully determines selection. |
| `incorrect` | **Low to medium** - usually timestamp-driven; ordering mostly affects equal-timestamp ties. |
| `bookmarked` | **Mixed** - high when many are unattempted; otherwise mostly timestamp-driven. |

## Why this was debt (not just a local 4-line tweak)

- Deterministic daily behavior needed injected clock control in `GetNextQuestionUseCase` for stable tests (`now: () => Date`).
- Every `GetNextQuestionUseCase` instantiation path had to be verified for constructor parity.
- Existing tests covered selection behavior, but not daily-seeded candidate ordering semantics in filter mode.
- Docs and coverage map had to be updated after implementation to remove "target state" language.

## Implementation (minimal robust)

Fix kept in the application layer (`GetNextQuestionUseCase.executeForFilters`) so repositories remain data providers and ordering policy remains use-case orchestration.

```typescript
const candidateIds = await this.questions.listPublishedCandidateIds({ ...filters, userId });
if (candidateIds.length === 0) return null;

const now = this.now();
const utcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const seed = createSeed(userId, utcDayStartMs);
const canonicalCandidateIds = candidateIds.slice().sort();
const orderedCandidateIds = shuffleWithSeed(canonicalCandidateIds, seed);

const selectedId = selectNextQuestionId(orderedCandidateIds, byQuestionId);
```

Same seed across filters is acceptable and expected: `unanswered`, `incorrect`, and `bookmarked` pools differ, so permutations differ.

## Change set (completed)

### 1. Added clock injection to `GetNextQuestionUseCase`

**File:** `src/application/use-cases/get-next-question.ts`
Constructor param: `now: () => Date = () => new Date()`.

### 2. Canonicalized and shuffled Quick Practice candidates before selection

**File:** `src/application/use-cases/get-next-question.ts` (`executeForFilters`)
Daily UTC seed + canonical ID sort + `shuffleWithSeed` applied before `selectNextQuestionId`.

### 3. Updated constructor call sites

**Updated instantiation points:**
- `lib/container/use-cases.ts` — `primitives.now` injected
- `tests/integration/controllers.integration.test.ts` — `() => new Date()` injected
- `src/application/use-cases/get-next-question.test.ts` — `overrides.now` injected via `createTestDeps`

### 4. Added unit tests

**File:** `src/application/use-cases/get-next-question.test.ts`

Seven new tests:
- Daily-seeded shuffle is applied before selection in filter mode.
- Same user + same UTC day => same selected question (unchanged history).
- UTC day boundary => new daily seed and deterministic re-evaluation of candidate order (with potential question rotation).
- Oldest-attempt fallback remains unchanged when oldest is unique.
- Equal-timestamp all-attempted ties resolve deterministically from shuffled order.
- Status-specific filter pools (`unanswered`/`incorrect`/`bookmarked`) each follow shuffled-candidate contract.
- Repository-order invariance: same candidate set, same user/day, same selected question even if repository returns different permutations.

### 5. Aligned docs after implementation

**Files updated:**
- `docs/practice-engine/ordering-policy.md` — paths 4-6 changed from "Target: Yes" to "Yes"; DEBT-268 reference removed
- `docs/practice-engine/practice-modes.md` — ad-hoc description updated to reflect implemented daily-seeded shuffle
- `docs/practice-engine/current-state.md` — DEBT-268 removed from open debt
- `docs/practice-engine/frontend-layer.md` — DEBT-268 tracking note removed
- `docs/debt/index.md` — DEBT-268 moved to resolved
- `docs/adr/adr-003-testing-strategy.md` — code example updated to 4-arg constructor

## Acceptance criteria

- [x] `GetNextQuestionUseCase` accepts injected `now`.
- [x] `executeForFilters` shuffles candidates with `createSeed(userId, utcDayStartMs)` before `selectNextQuestionId`.
- [x] `executeForFilters` canonicalizes candidate IDs before shuffling, so repository permutation does not change selection.
- [x] Quick Practice `unanswered` no longer follows repository order.
- [x] Quick Practice `incorrect` and `bookmarked` follow same shuffled-candidate contract.
- [x] All-attempted unique-oldest fallback is unchanged.
- [x] Equal-timestamp tie-break is deterministic and based on shuffled candidate order.
- [x] Session creation and session review ordering behavior is unchanged.
- [x] Single-question/review choice-order behavior remains deterministic via `buildShuffledChoiceViews`.
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` passes.
- [x] Practice engine docs updated to implemented state.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Missed `GetNextQuestionUseCase` instantiation update | Keep default `now` parameter; audit all `new GetNextQuestionUseCase(...)` call sites. |
| Perceived over-stability ("same first question all day") | Daily window is intentional baseline; reduce window later only if product signals demand it. |
| Behavior drift at UTC midnight | Document as expected by design; verify with explicit day-boundary tests. |
| Surprising tie behavior for equal timestamps | Treat as defined contract and lock with tests. |

## Non-goals

- No changes to repository query ordering (`createdAt DESC, id ASC`).
- No changes to `selectNextQuestionId` rules.
- No changes to session-mode ordering (tutor/exam/review).
- No changes to choice shuffling contract.

## Implementation notes

- `createSeed` and `shuffleWithSeed` already existed in `src/domain/services`.
- Daily timestamp uses UTC day start (`Date.UTC(year, month, date)`) to avoid server locale drift.
- Quick Practice currently sends a single status (`statuses: [filters.status]`) from client, but the fix holds for any status array shape accepted by `QuestionFilters`.
