# DEBT-268: Quick Practice Ordering Policy Alignment

**Status:** Active
**Priority:** P2
**Date:** 2026-03-02
**Owner:** Practice Engine
**Related:** [BS-038](../_archive/brainstorming/bs-038-quick-practice-question-ordering-not-randomized.md), [Ordering Policy](../practice-engine/ordering-policy.md), Issue #54, SPEC-013, SPEC-024

---

## Description

`GetNextQuestionUseCase.executeForFilters()` passes candidate IDs to `selectNextQuestionId` in unshuffled repository order. Because `selectNextQuestionId` is order-dependent (first unattempted in candidate order), DB insertion order leaks directly into question selection.

This violates the ordering policy defined in [ordering-policy.md](../practice-engine/ordering-policy.md) Section 3.3: Quick Practice candidates must be shuffled with a daily seed before selection.

### Severity by filter

| Filter | Practical Impact |
|--------|-----------------|
| `unanswered` | **High** — 100% of candidates are unattempted, so DB order fully determines selection. Users see topic-clustered questions from the same content batch. |
| `incorrect` | **Low** — most candidates have distinct `answeredAt` timestamps, so oldest-timestamp drives selection. DB order only affects equal-timestamp tie-breaks. |
| `bookmarked` | **Mixed** — when unattempted bookmarks exist, DB order matters strongly. Otherwise mostly timestamp-driven. |

## Why this is debt (not a one-line fix)

- Requires adding `now: () => Date` constructor injection to `GetNextQuestionUseCase` (mirroring `StartPracticeSessionUseCase`).
- All composition roots that instantiate `GetNextQuestionUseCase` must be updated.
- Unit tests must cover deterministic ordering, day-boundary rotation, and all three filter modes.
- Practice engine docs must be aligned after implementation.

## Required change set

### 1. Add `now` injection to `GetNextQuestionUseCase`

**File:** `src/application/use-cases/get-next-question.ts`

Add `now: () => Date = () => new Date()` as a fourth constructor parameter.

### 2. Shuffle candidates in `executeForFilters`

**File:** `src/application/use-cases/get-next-question.ts` (`executeForFilters` method)

```typescript
// After loading candidateIds, before calling selectNextQuestionId:
const now = this.now();
const utcDayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const seed = createSeed(userId, utcDayStartMs);
const orderedCandidateIds = shuffleWithSeed(candidateIds, seed);

const selectedId = selectNextQuestionId(orderedCandidateIds, byQuestionId);
```

### 3. Update composition roots

**Files:** All Server Action controllers that instantiate `GetNextQuestionUseCase`.

Pass `() => new Date()` (or omit for default) to the new constructor parameter.

### 4. Add/update unit tests

**File:** `src/application/use-cases/get-next-question.test.ts`

New test cases:
- `unanswered` filter picks from shuffled candidate order, not raw repository order.
- Same user + same UTC day = same selected question (given unchanged history).
- Day boundary changes candidate permutation (different UTC date = different selection).
- All-attempted fallback still chooses oldest timestamp (regression guard).
- Equal-timestamp fallback uses deterministic tie-break from shuffled order.

### 5. Align practice engine docs

**Files:**
- `docs/practice-engine/practice-modes.md` Section 4 — update ad-hoc description to reference daily-seed shuffle.
- `docs/practice-engine/ordering-policy.md` — change paths 4–6 from "Target: Yes" to "Yes" and remove DEBT-268 reference.

## Acceptance criteria

- [ ] `GetNextQuestionUseCase` constructor accepts `now: () => Date`.
- [ ] `executeForFilters` shuffles candidates with `createSeed(userId, dailyTimestamp)` before calling `selectNextQuestionId`.
- [ ] Quick Practice `unanswered` does not cluster by content batch (manual verification).
- [ ] Quick Practice `incorrect` and `bookmarked` show no regressions.
- [ ] Tutor/exam/session review behavior is unchanged.
- [ ] All new unit tests pass.
- [ ] Pre-PR gate passes: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
- [ ] Practice engine docs updated to reflect implemented state.

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Composition root missed — some code path still creates `GetNextQuestionUseCase` without `now` | Default parameter `= () => new Date()` makes this safe; missed roots get production behavior. TypeScript will not break. |
| Daily seed feels too stable (same first question all day) | Daily granularity is a starting point. Can move to shorter windows later if user feedback warrants it. |
| Shuffle changes which question users see next (existing study patterns disrupted) | This is the intended fix. Users currently see clustered patterns, which is worse. |

## Implementation notes

- `createSeed` and `shuffleWithSeed` are already public exports from `src/domain/services`. No domain changes needed.
- `hashString` is private to `shuffle.ts`. The daily seed computation uses `Date.UTC()` to produce a numeric timestamp, avoiding any need to access private internals.
- The `selectNextQuestionId` domain service is unchanged. It continues to be order-dependent by contract; the fix is in what order we give it candidates.
