# DEBT-268: Quick Practice Ordering Policy Alignment

**Status:** Active
**Priority:** P2
**Date:** 2026-03-02
**Owner:** Practice Engine
**Related:** [BS-038](../_archive/brainstorming/bs-038-quick-practice-question-ordering-not-randomized.md), [Ordering Policy](../practice-engine/ordering-policy.md), Issue #54, SPEC-013, SPEC-024

---

## Executive summary

`GetNextQuestionUseCase.executeForFilters()` currently passes repository-returned candidates directly into `selectNextQuestionId()` without shuffling.  
`selectNextQuestionId()` is intentionally order-dependent (`first unattempted`, then `oldest answeredAt`), so ordering policy is currently inherited from repository order.

Important correction: the current leak is not raw table insertion order; it is explicit repository ordering (`ORDER BY questions.createdAt DESC, questions.id ASC`) from `DrizzleQuestionRepository.listPublishedCandidateIds()`.

This violates [ordering-policy.md](../practice-engine/ordering-policy.md) Section 3.3, which requires a daily-seeded shuffle before Quick Practice selection.

## Tracer-bullet audit (vertical + horizontal, verified 2026-03-02)

| # | Scenario | Pass/Fail | Verified path | Notes |
|---|----------|-----------|---------------|-------|
| 1 | Session with all questions (no tag filter) | **Pass** | `StartPracticeSessionUseCase.execute` -> `listPublishedCandidateIds` -> `shuffleWithSeed(...).slice(...)` | Full pool is shuffled before slice. |
| 2 | Session with subset (tag-filtered) | **Pass** | `listPublishedCandidateIds` applies filters first; `StartPracticeSessionUseCase` shuffles returned subset | Filter-then-shuffle behavior is correct. |
| 3 | Tutor session (N questions) | **Pass** | Same `StartPracticeSessionUseCase` path | Shuffle-then-slice is correct. |
| 4 | Exam session (N questions) | **Pass** | Same `StartPracticeSessionUseCase` path | Tutor/exam parity confirmed. |
| 5 | Quick Practice - unanswered | **Fail** | `QuickPracticeClient` -> `getNextQuestion` -> `GetNextQuestionUseCase.executeForFilters` -> `selectNextQuestionId(candidateIds, ...)` | No shuffle before selection. |
| 6 | Quick Practice - incorrect | **Fail** | Same as #5 | Same unshuffled path. |
| 7 | Quick Practice - bookmarked | **Fail** | Same as #5 | Same unshuffled path. |
| 8 | Single-question paths (bookmark/history/dashboard question open) | **Pass** | `getQuestionBySlug` + `GetPreviousAttemptUseCase` | Choice order still uses `buildShuffledChoiceViews`. Question ordering N/A. |
| 9 | Session review/history review ordering | **Pass** | `GetPracticeSessionReviewUseCase` iterates persisted `session.questionIds`; review nav uses returned row order | Preserves original session order; no reshuffle. |
| 10 | All-attempted fallback behavior | **Pass (with tie nuance)** | `selectNextQuestionId` oldest timestamp fallback | Shuffling candidates does not change winner when oldest timestamp is unique; equal-timestamp ties are intentionally order-based. |

## Severity by Quick Practice filter

| Filter | Practical impact |
|--------|------------------|
| `unanswered` | **High** - 100% unattempted pool, so candidate order fully determines selection. |
| `incorrect` | **Low to medium** - usually timestamp-driven; ordering mostly affects equal-timestamp ties. |
| `bookmarked` | **Mixed** - high when many are unattempted; otherwise mostly timestamp-driven. |

## Why this is debt (not just a local 4-line tweak)

- Deterministic daily behavior needs injected clock control in `GetNextQuestionUseCase` for stable tests (`now: () => Date`).
- Every `GetNextQuestionUseCase` instantiation path must be verified for constructor parity.
- Existing tests cover selection behavior, but not daily-seeded candidate ordering semantics in filter mode.
- Docs and coverage map must be updated after implementation to remove "target state" language.

## Recommended implementation (minimal robust)

Keep the fix in the application layer (`GetNextQuestionUseCase.executeForFilters`) so repositories remain data providers and ordering policy remains use-case orchestration.

```typescript
const candidateIds = await this.questions.listPublishedCandidateIds({ ...filters, userId });
if (candidateIds.length === 0) return null;

const now = this.now();
const utcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const seed = createSeed(userId, utcDayStartMs);
const orderedCandidateIds = shuffleWithSeed(candidateIds, seed);

const selectedId = selectNextQuestionId(orderedCandidateIds, byQuestionId);
```

Same seed across filters is acceptable and expected: `unanswered`, `incorrect`, and `bookmarked` pools differ, so permutations differ.

## Required change set

### 1. Add clock injection to `GetNextQuestionUseCase`

**File:** `src/application/use-cases/get-next-question.ts`  
Add constructor param: `now: () => Date = () => new Date()`.

### 2. Shuffle Quick Practice candidates before selection

**File:** `src/application/use-cases/get-next-question.ts` (`executeForFilters`)  
Apply daily UTC seed + `shuffleWithSeed` before `selectNextQuestionId`.

### 3. Update constructor call sites

**Known instantiation points:**
- `lib/container/use-cases.ts`
- `tests/integration/controllers.integration.test.ts`
- `src/application/use-cases/get-next-question.test.ts`

Use explicit fixed clocks in tests that assert day-boundary behavior.

### 4. Expand tests (unit + integration)

**Primary file:** `src/application/use-cases/get-next-question.test.ts`

Add tests for:
- Daily-seeded shuffle is applied before selection in filter mode.
- Same user + same UTC day => same selected question (unchanged history).
- UTC day boundary => new permutation and potentially new selected question.
- Oldest-attempt fallback remains unchanged when oldest is unique.
- Equal-timestamp all-attempted ties resolve deterministically from shuffled order.
- Status-specific filter pools (`unanswered`/`incorrect`/`bookmarked`) each follow shuffled-candidate contract.

Add/adjust integration test(s) in `tests/integration/controllers.integration.test.ts` with fixed `now` to verify full stack behavior through controller wiring.

### 5. Align docs after implementation

**Files:**
- `docs/practice-engine/ordering-policy.md`
- `docs/practice-engine/practice-modes.md`
- `docs/practice-engine/spec-coverage-map.md`

## Acceptance criteria

- [ ] `GetNextQuestionUseCase` accepts injected `now`.
- [ ] `executeForFilters` shuffles candidates with `createSeed(userId, utcDayStartMs)` before `selectNextQuestionId`.
- [ ] Quick Practice `unanswered` no longer follows repository order.
- [ ] Quick Practice `incorrect` and `bookmarked` follow same shuffled-candidate contract.
- [ ] All-attempted unique-oldest fallback is unchanged.
- [ ] Equal-timestamp tie-break is deterministic and based on shuffled candidate order.
- [ ] Session creation and session review ordering behavior is unchanged.
- [ ] Single-question/review choice-order behavior remains deterministic via `buildShuffledChoiceViews`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` passes.
- [ ] Practice engine docs updated to implemented state.

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

- `createSeed` and `shuffleWithSeed` already exist in `src/domain/services`.
- Daily timestamp must use UTC day start (`Date.UTC(year, month, date)`) to avoid server locale drift.
- Quick Practice currently sends a single status (`statuses: [filters.status]`) from client, but the fix must hold for any status array shape accepted by `QuestionFilters`.
