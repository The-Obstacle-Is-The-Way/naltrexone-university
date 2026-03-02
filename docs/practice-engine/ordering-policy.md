# Practice Engine: Question and Choice Ordering Policy

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Canonical ordering rules for question selection and choice display across all practice paths
> **Last Verified:** 2026-03-02

---

## 1. Design Principles

All ordering behavior in the practice engine must satisfy these five properties:

| # | Principle | Why It Matters |
|---|-----------|---------------|
| 1 | **Interleaving** | Broad study pools (especially unanswered/full-pool work) should draw from across topics, not cluster by content batch. |
| 2 | **Short-window stability** | Refreshing the page or re-entering the same flow should not feel chaotic; the same user in the same study window should see consistent ordering. |
| 3 | **Explicit rules per path** | Every question-serving path must have a documented ordering contract. No path should rely on accidental DB order. |
| 4 | **Immutable historical order** | Completed session review must preserve the exact question sequence the user experienced. |
| 5 | **No DB-order coupling** | Learning behavior must never depend on repository sort order (`createdAt`, `id`) or content ingestion batch structure. |

---

## 2. Two Ordering Dimensions

The practice engine has two independent ordering concerns:

1. **Question ordering** — which question to show next (or in what sequence).
2. **Choice ordering** — how answer choices (A/B/C/D/E) are labeled and displayed for a given question.

These are solved by different mechanisms with different seed strategies (question ordering via use-case orchestration + domain services; choice ordering via `buildShuffledChoiceViews` + domain services).

---

## 3. Question Ordering by Path

### 3.1 Session-Based Paths (Tutor / Exam)

**When:** User starts a practice session via the practice starter.

**Ordering contract:**

```text
listPublishedCandidateIds(filters)
  → shuffleWithSeed(candidates, createSeed(userId, now))
  → slice(0, count)
  → persist as session.questionIds
```

- Shuffle happens **once at session creation** in `StartPracticeSessionUseCase`.
- Seed is `createSeed(userId, now.getTime())` — unique per user per session start time.
- The resulting `questionIds` array is the immutable session sequence.
- During the session, `GetNextQuestionUseCase.executeForSession()` walks this persisted array.
- Tag filters, difficulty filters, and status filters are applied **before** shuffle (filter-then-shuffle-then-slice).

**Files:** `src/application/use-cases/start-practice-session.ts`, `src/domain/services/shuffle.ts`

### 3.2 Session Review

**When:** User reviews a completed session (from history or end-of-session summary).

**Ordering contract:** Preserve the original `questionIds` array exactly as persisted. No reshuffle.

**Files:** `src/application/use-cases/get-practice-session-review.ts`

### 3.3 Quick Practice (Filter-Driven, Stateless)

**When:** User enters Quick Practice with optional status/tag/difficulty filters.

**Ordering contract:**

```text
listPublishedCandidateIds(filters)
  → canonicalize(candidates) // stable ID sort
  → shuffleWithSeed(canonicalCandidates, createSeed(userId, dailySeedTimestamp))
  → selectNextQuestionId(shuffledCandidates, attemptHistory)
```

- Shuffle candidates **before** passing to `selectNextQuestionId`.
- Canonicalization happens before shuffle so the same candidate set yields the same shuffled order regardless of repository return order.
- Seed is daily-granularity: `createSeed(userId, Date.UTC(year, month, date))`.
- Daily seed ensures:
  - **Interleaving**: candidates are not in DB insertion order.
  - **Short-window stability**: same user on the same day sees the same candidate permutation.
  - **Day-boundary freshness**: the seed changes each UTC day, so ordering is expected to rotate over time and avoid stale patterns.

**Selection rule** (unchanged from `selectNextQuestionId`):
1. First unattempted candidate in shuffled order.
2. If all candidates are attempted: oldest last-attempt timestamp wins.
3. Equal-timestamp ties: resolved by position in shuffled order (deterministic).

**Status-filter nuance:**
- `unanswered`: 100% of candidates are unattempted, so shuffled order fully determines selection.
- `incorrect`: most candidates have distinct timestamps, so oldest-timestamp drives selection; shuffle mainly affects tie-breaks.
- `bookmarked`: mixed; shuffle matters when unattempted bookmarks exist; otherwise mostly timestamp-driven.

**Files:** `src/application/use-cases/get-next-question.ts` (`executeForFilters`), `src/domain/services/question-selection.ts`

### 3.4 Single-Question Paths

**When:** User clicks a specific question from bookmarks, history questions tab, dashboard activity, or a direct `/app/questions/[slug]` link.

**Ordering contract:** N/A — the user selected a specific question. Only choice ordering applies.

---

## 4. Choice Ordering (All Paths)

Every path that serves a question to the user shuffles answer choices deterministically.

**Contract:**

```text
buildShuffledChoiceViews(question, userId)
  → sort choices by (sortOrder, id) for stable input
  → shuffleWithSeed(sortedChoices, createQuestionSeed(userId, questionId))
  → assign displayLabel (A, B, C, D, E) by shuffled position
```

- Seed is `createQuestionSeed(userId, questionId)` — same user always sees the same choice order for the same question.
- Different users see different choice orders for the same question.
- Choice order is **independent** of question ordering — it depends only on user+question identity.
- Applied uniformly across: session questions, quick practice, review mode, standalone question pages.

**Files:** `src/application/shared/shuffled-choice-views.ts`, `src/domain/services/shuffle.ts`

---

## 5. Domain Service Contracts

| Service | Function | Inputs | Deterministic? | Purpose |
|---------|----------|--------|----------------|---------|
| `shuffle.ts` | `shuffleWithSeed<T>(items, seed)` | Array + numeric seed | Yes (Fisher-Yates + Mulberry32) | Permute any array deterministically |
| `shuffle.ts` | `createSeed(userId, timestamp)` | String + number | Yes (non-cryptographic int32 hash) | Generate seed from user identity + time |
| `shuffle.ts` | `createQuestionSeed(userId, questionId)` | String + string | Yes (non-cryptographic int32 hash) | Generate seed from user + question identity |
| `question-selection.ts` | `selectNextQuestionId(candidateIds, attemptHistory)` | Ordered IDs + timestamp map | Yes (order-dependent) | Pick next question from candidate list |

**Key invariant:** `selectNextQuestionId` is order-dependent by design. Its output is fully determined by the order of `candidateIds` plus `attemptHistory`. This is correct and intentional — the caller is responsible for providing candidates in the desired order (shuffled or otherwise).

---

## 6. Anti-Patterns (What Ordering Must NOT Depend On)

| Anti-Pattern | Why It's Wrong | How to Detect |
|-------------|---------------|---------------|
| DB insertion order (`createdAt`) | Content batches share timestamps, causing topic clustering | Questions from the same source paper appear consecutively |
| Repository sort clause (`ORDER BY`) | Leaks infrastructure ordering into learning behavior | Changing the repo sort changes what users study first |
| Content ingestion batch order | Batch inserts can preserve source/topic adjacency | Questions from one source appear back-to-back in quick practice |
| Candidate array as returned from repository | Repository contract is "return matching IDs" not "return in study order" | Quick practice shows questions grouped by topic/source |

The fix for all of these is the same: **shuffle before selecting**. Repositories return candidates; the application layer applies ordering policy.

---

## 7. Ordering Path Summary Matrix

| # | Path | Question Ordering | Choice Ordering | Shuffle Applied? |
|---|------|-------------------|-----------------|------------------|
| 1 | Session (tutor/exam) — creation | `shuffleWithSeed` at creation | `buildShuffledChoiceViews` | Yes |
| 2 | Session (tutor/exam) — in-progress | Walk persisted `questionIds` | `buildShuffledChoiceViews` | Yes (at creation) |
| 3 | Session review | Preserve persisted `questionIds` | `buildShuffledChoiceViews` | Yes (at creation) |
| 4 | Quick Practice — unanswered | `shuffleWithSeed` (daily seed) + `selectNextQuestionId` | `buildShuffledChoiceViews` | Yes |
| 5 | Quick Practice — incorrect | `shuffleWithSeed` (daily seed) + `selectNextQuestionId` | `buildShuffledChoiceViews` | Yes |
| 6 | Quick Practice — bookmarked | `shuffleWithSeed` (daily seed) + `selectNextQuestionId` | `buildShuffledChoiceViews` | Yes |
| 7 | Single question (bookmark/history/dashboard click) | N/A (user-selected) | `buildShuffledChoiceViews` | N/A |

---

## 8. Related Documentation

| Document | Relevance |
|----------|-----------|
| [Practice Modes](./practice-modes.md) | Session lifecycle, question selection overview |
| [Architecture Layers](./architecture-layers.md) | Domain service inventory including shuffle and selection |
| [Content Pipeline](./content-pipeline.md) | How content batch structure creates DB insertion order |
| [Retry Logic](./retry-logic.md) | Reattempt semantics (ordering is independent of retry provenance) |
| [BS-038](../_archive/brainstorming/bs-038-quick-practice-question-ordering-not-randomized.md) | Original audit that identified the ordering gap |
