# BS-038: Practice Engine Randomization Audit — Quick Practice Not Shuffled

**Date:** 2026-03-02
**Triggered by:** User observation — Quick Practice serves consecutive same-topic questions (e.g., Zopiclone → Zopiclone → Zopiclone)
**Scope:** Full-stack audit of question randomization across every practice engine entry point
**Related:** Issue #54 (Randomize question order — resolved for sessions only), `shuffleWithSeed()`, `selectNextQuestionId()`

---

## First Principles: What Randomization Should Accomplish

A medical education platform must satisfy these randomization properties:

1. **Topic interleaving** — Questions from different source papers and topics should be interleaved, never clustered. Spaced interleaving is a well-established learning science principle that improves long-term retention.
2. **Unpredictability** — The learner should not be able to predict the next question's topic. This prevents pattern shortcuts and forces genuine recall.
3. **Determinism within a study session** — If the user refreshes the page mid-session, the order should not change. Consistency avoids confusion.
4. **Freshness across study sessions** — Each new session/day should feel different. The user should not encounter the same first-5-questions pattern every time.
5. **Choice order shuffling** — Answer options (A/B/C/D) must be shuffled per user per question so "the answer is always B" is impossible.
6. **Review fidelity** — When reviewing a completed session, the original question order must be preserved for coherent reflection.

---

## How the Content Creates Clustering Risk

Questions are authored and seeded from content files organized **by source paper**:

```
content/questions/imported/
  article-based-pathway/ahmed-2020/
    ahmed-2020-001.mdx    ← 12 questions from one paper
    ahmed-2020-002.mdx
    ...
    ahmed-2020-012.mdx
  prescribers-guide/stahls-7e-zopiclone/
    stahls-7e-zopiclone-001.mdx  ← 4 questions per medication
    ...
    stahls-7e-zopiclone-004.mdx
```

**960 questions** across 7 topic areas, organized as ~80 batches of 4–12 questions each.

The seeding script inserts these in batch order. Questions from the same source get:
- **Similar `createdAt` timestamps** (same batch insert)
- **Sequential database IDs** (auto-increment)

The repository query `ORDER BY createdAt DESC, id ASC` preserves this batch order. **Without shuffling, questions march through batch-by-batch.**

---

## Full Audit: Every Question-Serving Path

### Randomization Mechanisms Available

| Mechanism | Location | Purpose |
|-----------|----------|---------|
| `shuffleWithSeed(items, seed)` | `src/domain/services/shuffle.ts` | Fisher-Yates shuffle with Mulberry32 PRNG — deterministic |
| `createSeed(userId, timestamp)` | `src/domain/services/shuffle.ts` | Seed for question ordering (per session) |
| `createQuestionSeed(userId, questionId)` | `src/domain/services/shuffle.ts` | Seed for choice ordering (per question) |
| `selectNextQuestionId(candidates, history)` | `src/domain/services/question-selection.ts` | Stateless selector: first unanswered or oldest-answered |
| `buildShuffledChoiceViews(question, userId)` | `src/application/shared/shuffled-choice-views.ts` | Shuffles A/B/C/D order per user per question |

### Path-by-Path Audit

#### 1. Session Creation — Tutor Mode ✅ SHUFFLED

```
Frontend:  practice-page-client.tsx → startSession()
Action:    practice-controller.ts → startPracticeSession
Use case:  StartPracticeSessionUseCase.execute()
  → listPublishedCandidateIds(filters)         // DB order
  → createSeed(userId, Date.now())              // Unique seed
  → shuffleWithSeed(candidateIds, seed)         // Fisher-Yates
  → .slice(0, count)                            // Take N
  → Store in session.paramsJson.questionIds     // Canonical order
```

**Verdict:** Correctly randomized. Different seed every session. Stored order is immutable.

#### 2. Session Creation — Exam Mode ✅ SHUFFLED

Identical code path to Tutor. Only difference is `mode: 'exam'` (explanations hidden until session end).

**Verdict:** Correctly randomized.

#### 3. Session Creation — Tag-Filtered ✅ SHUFFLED

When user selects specific tags in the Practice Starter, the tag filters narrow `listPublishedCandidateIds()` but the same `shuffleWithSeed()` applies.

**Verdict:** Correctly randomized within the filtered subset.

#### 4. Quick Practice — Unanswered ❌ NOT SHUFFLED

```
Frontend:  quick-practice-client.tsx → usePracticeQuestionFlow({ filters })
Action:    question-controller.ts → getNextQuestion
Use case:  GetNextQuestionUseCase.executeForFilters()
  → listPublishedCandidateIds(filters)         // DB order
  → selectNextQuestionId(candidateIds, history) // First unanswered in DB order
  → Return single question                      // No shuffle anywhere
```

**Verdict:** No shuffling. Questions served in batch-insertion order. **This is the primary bug.**

#### 5. Quick Practice — Incorrect ❌ NOT SHUFFLED

Same code path as #4 with `statuses: ['incorrect']`. The filter narrows the pool to questions the user got wrong, but the candidate order is still database insertion order.

**Verdict:** No shuffling. Incorrect questions from the same batch appear consecutively. Pool is smaller (only wrong answers) so clustering is somewhat less noticeable, but still present if user got multiple questions wrong from the same paper.

#### 6. Quick Practice — Bookmarked ❌ NOT SHUFFLED

Same code path as #4 with `statuses: ['bookmarked']`. Pool is only user-bookmarked questions.

**Verdict:** No shuffling. Same ordering issue, though user-curated pools may be naturally more diverse since bookmarking is intentional.

#### 7. Session In-Progress Navigation ✅ CORRECT (preserves shuffled order)

```
Frontend:  practice-session-page-client.tsx → onNextQuestion()
Use case:  GetNextQuestionUseCase.executeForSession()
  → session.questionIds[index]                  // Pre-shuffled array
  → Find next unanswered from current index     // Walks shuffled order
```

**Verdict:** Correctly follows the session's pre-shuffled `questionIds` array. No re-shuffling needed.

#### 8. Session Review (Active or Completed) ✅ CORRECT (preserves shuffled order)

```
Frontend:  practice-session-page-client.tsx (review stage)
Use case:  GetPracticeSessionReviewUseCase.execute()
  → session.questionIds.forEach((id, i) => order = i + 1)
  → Preserves original shuffled sequence
```

**Verdict:** Correctly preserves original session order for coherent review.

#### 9. History → Review Past Session ✅ CORRECT (preserves shuffled order)

Same as #8. Navigates to `/practice/[sessionId]` with review mode. Loads original session data.

**Verdict:** Correct.

#### 10. Bookmark List → Reattempt ⚪ N/A (single question, user-selected)

User picks an individual question from their bookmark list. No ordering applies — it's a single-question view.

**Verdict:** Not applicable. If user clicks "Next" after reattempt, it enters Quick Practice filter path (#6), which is unshuffled.

#### 11. History Questions Tab ⚪ N/A (viewing history, not practicing)

Paginated list of all attempted questions. Ordered by attempt timestamp. This is a history view, not a practice flow.

**Verdict:** Not applicable to practice randomization.

### Summary Matrix

| # | Path | Question Shuffle | Choice Shuffle | Correct? |
|---|------|-----------------|----------------|----------|
| 1 | Tutor Session | ✅ `shuffleWithSeed` | ✅ `buildShuffledChoiceViews` | ✅ |
| 2 | Exam Session | ✅ `shuffleWithSeed` | ✅ `buildShuffledChoiceViews` | ✅ |
| 3 | Tag-Filtered Session | ✅ `shuffleWithSeed` | ✅ `buildShuffledChoiceViews` | ✅ |
| 4 | Quick Practice — Unanswered | ❌ DB order | ✅ `buildShuffledChoiceViews` | ❌ |
| 5 | Quick Practice — Incorrect | ❌ DB order | ✅ `buildShuffledChoiceViews` | ❌ |
| 6 | Quick Practice — Bookmarked | ❌ DB order | ✅ `buildShuffledChoiceViews` | ❌ |
| 7 | Session Navigation | ✅ Preserved | ✅ `buildShuffledChoiceViews` | ✅ |
| 8 | Session Review | ✅ Preserved | ✅ `buildShuffledChoiceViews` | ✅ |
| 9 | History Review | ✅ Preserved | ✅ `buildShuffledChoiceViews` | ✅ |
| 10 | Bookmark Reattempt | ⚪ N/A (single) | ✅ `buildShuffledChoiceViews` | ✅ |
| 11 | History Questions | ⚪ N/A (history) | ✅ `buildShuffledChoiceViews` | ✅ |

**Choice shuffling works correctly everywhere.** The gap is exclusively in **question ordering** for Quick Practice paths (4, 5, 6).

---

## Root Cause

### The two code paths

`GetNextQuestionUseCase` has two execution branches:

**`executeForSession()`** (paths 1–3, 7–9): Reads `session.questionIds` — a pre-shuffled array created at session start. Order is locked.

**`executeForFilters()`** (paths 4–6): Fetches candidates from DB, calls `selectNextQuestionId()` to pick one. **No shuffle step exists in this branch.**

```typescript
// get-next-question.ts — executeForFilters (lines 222-261)
const candidateIds = await this.questions.listPublishedCandidateIds({...});
// ← candidateIds are in DB order (DESC createdAt, ASC id)
// ← No shuffleWithSeed() call here
const selectedId = selectNextQuestionId(candidateIds, byQuestionId);
// ← selectNextQuestionId walks array sequentially → batch clustering
```

### Why Issue #54 didn't catch this

Issue #54 added `shuffleWithSeed()` to `StartPracticeSessionUseCase`. This correctly solved session-based practice. But Quick Practice follows a fundamentally different code path that was not covered:

- Sessions create a shuffled snapshot at start → immutable order
- Quick Practice is stateless → picks one question per request, no snapshot

The `selectNextQuestionId` domain service is correctly designed — its contract is "first unanswered in candidate order." The problem is that its input (`candidateIds`) is in batch-insertion order, not shuffled order.

---

## Severity Assessment

**Severity: Medium-High (UX / Learning Effectiveness)**

- **Who:** Every Quick Practice user — the most accessible, lowest-friction practice mode
- **How often:** Every single Quick Practice interaction
- **Impact:** Topic clustering undermines the spaced-interleaving learning benefit. Users see Zopiclone → Zopiclone → Zopiclone instead of a varied mix
- **Perception:** "The randomization is broken" — erodes trust in the platform
- **Data integrity:** Not affected. No data loss or corruption. Sessions still shuffle correctly.
- **Incorrect/Bookmarked pools:** Lower severity since these are smaller, user-curated pools, but still affected

---

## Proposed Fix

### Recommendation: Shuffle candidates in `executeForFilters()` with a daily seed

Add a shuffle step before `selectNextQuestionId()` — the minimal, architecturally clean fix:

```typescript
// In GetNextQuestionUseCase.executeForFilters()
import { shuffleWithSeed, createSeed } from '@/src/domain/services';

private async executeForFilters(userId: string, filters: QuestionFilters) {
  const candidateIds = await this.questions.listPublishedCandidateIds({...});
  if (candidateIds.length === 0) return null;

  // NEW: Shuffle candidates to break batch clustering
  const dayKey = this.now().toISOString().slice(0, 10); // "2026-03-02"
  const seed = createSeed(userId, hashString(dayKey));
  const shuffledIds = shuffleWithSeed(candidateIds, seed);

  const mostRecent = await this.attempts.findMostRecentAnsweredAtByQuestionIds(userId, candidateIds);
  const byQuestionId = new Map(mostRecent.map((r) => [r.questionId, r.answeredAt]));

  const selectedId = selectNextQuestionId(shuffledIds, byQuestionId);
  // ... rest unchanged
}
```

### Why daily seed

| Seed Strategy | Within-Session Stability | Cross-Session Freshness | Implementation |
|---------------|-------------------------|------------------------|----------------|
| Per-request (`Math.random()`) | ❌ Different on refresh | ✅ Always different | Simplest |
| Per-user (static) | ✅ Always same | ❌ Never changes | Simple |
| **Per-user-per-day** | **✅ Stable within a day** | **✅ Fresh each day** | **3-4 lines** |
| Per-user-per-week | ✅ Stable within a week | ⚠️ Slow refresh | 3-4 lines |

**Daily seed is ideal for medical education:** Same study session maintains a consistent order (no confusion on refresh), but each new day brings a fresh shuffle. Maps naturally to how learners study — daily review sessions.

### Why not the alternatives

**Option B (DB-level randomization):** Mixes shuffle concerns into the repository layer. Violates Clean Architecture — the query layer shouldn't know about randomization strategy.

**Option C (Hidden Quick Practice session):** Over-engineered. Changes the stateless nature of Quick Practice. Adds database writes for a mode designed to be lightweight. Session cleanup complexity.

### Architecture compliance

- `shuffleWithSeed` and `createSeed` already live in the domain layer (`src/domain/services/shuffle.ts`)
- `executeForFilters` is in the application layer — importing domain services is the correct dependency direction
- `selectNextQuestionId` contract is unchanged — it still picks "first unanswered in given order"
- No repository interface changes needed
- No frontend changes needed
- `now()` is already injected into the use case (testable)

### What stays the same

- Choice shuffling (already correct everywhere)
- Session-based practice (already correct)
- Session review ordering (already correct)
- `selectNextQuestionId` logic (unchanged — just receives shuffled input)
- The "all answered → oldest answered" fallback (picks by timestamp, order-independent)

---

## Verification Plan

After implementing the fix, verify each path still works correctly:

| Path | Expected Behavior | How to Verify |
|------|-------------------|---------------|
| Quick Practice — Unanswered | Questions interleaved across topics | Manual: start quick practice, verify first 5 questions span different sources |
| Quick Practice — Incorrect | Incorrect questions from different batches interleaved | Manual: answer several wrong, re-enter with incorrect filter |
| Quick Practice — Bookmarked | Bookmarked questions not batch-clustered | Manual: bookmark from different topics, re-enter with bookmarked filter |
| Tutor Session | Still shuffled (no regression) | Existing tests pass |
| Exam Session | Still shuffled (no regression) | Existing tests pass |
| Session Review | Still in original session order | Existing tests pass |
| Page refresh in Quick Practice | Same question shown (daily seed stability) | Manual: refresh page, confirm same question |
| Next day | Different question ordering | Unit test: different dayKey → different shuffle |

### Unit test additions

```typescript
// In get-next-question.test.ts
it('shuffles candidate order for filter-based questions', () => {
  // Given candidates in batch order: [batch1-q1, batch1-q2, batch1-q3, batch2-q1, ...]
  // When executeForFilters is called
  // Then first selected question should not always be batch1-q1
});

it('produces same shuffle for same user on same day', () => {
  // Given same userId and same day
  // When executeForFilters is called twice
  // Then same question is selected both times
});

it('produces different shuffle on different days', () => {
  // Given same userId but different days
  // When executeForFilters is called
  // Then different question ordering (statistically)
});
```

---

## Open Questions

1. **Should the daily seed use calendar date or "study day" concept?** Calendar date (`YYYY-MM-DD`) is simplest and sufficient. No need for timezone complexity — UTC is fine since the seed just needs to be stable-ish, not exact.

2. **Should the `incorrect` and `bookmarked` filters use the same daily seed or a different one?** Same seed is fine — the candidate pools are already different (different filter queries), so the shuffle output will naturally differ even with the same seed.

3. **Is pure interleaving (guaranteed no same-topic adjacency) needed?** With 960 questions across 80+ batches, a Fisher-Yates shuffle statistically produces excellent interleaving. Explicit anti-adjacency constraints add complexity for marginal benefit. Recommend: shuffle is sufficient, revisit only if users report clustering after fix.

4. **Does `hashString` need to be exported?** It's currently internal to `shuffle.ts`. The daily-seed approach would need either: (a) export `hashString`, (b) use a new `createDailySeed(userId, dayKey)` helper, or (c) encode the day into a numeric timestamp (e.g., `Date.parse(dayKey)`). Option (c) avoids any new exports.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-02 | Document as BS-038 | Confirmed root cause: Quick Practice `executeForFilters` path has no shuffle step |
| 2026-03-02 | Expanded to full practice engine audit | Traced all 11 entry points; confirmed gap is exclusively in Quick Practice (paths 4-6) |
| 2026-03-02 | Recommend Option A (daily seed shuffle in `executeForFilters`) | Minimal change (~4 lines), architecturally clean, preserves stateless Quick Practice design |
