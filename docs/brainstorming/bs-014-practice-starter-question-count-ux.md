# BS-014: Practice Starter — Silent Truncation When Fewer Questions Available

**Date:** 2026-02-13
**Last Updated:** 2026-02-22
**Triggered by:** UX review of practice session starter question count behavior
**Scope:** Users can request more questions than their filters match, resulting in a silently truncated session
**Related:** GitHub #82, Issue #53
**Originally:** DEBT-207 (moved to brainstorming — the problem is real but the right UX fix needs design work before implementation)

---

## Current Status (2026-02-22)

The core problem (silent truncation) is **resolved for V1**. The pre-start available count display was implemented instead of the post-creation toast originally proposed. Users now see real-time feedback like "Only 2 questions available. Starting session with 2." before clicking Start. See [What Was Implemented](#what-was-implemented) below.

Remaining ideas for future UX polish are tracked in [Future Improvements](#future-improvements-not-yet-implemented).

---

## The Problem

When a user requests a 50-question practice session but their filter combination (status + difficulty + tags) only matches 30 questions, the session was silently created with 30 questions. The backend correctly truncates the shuffled candidate list (`shuffleWithSeed(...).slice(0, input.count)`) and persists `paramsJson.count = questionIds.length`, but the user received no indication that their session was shorter than requested.

### Clean Architecture Analysis

The use case layer already knows when `actual < requested` — it computes `questionIds.length` after applying the requested cap. Uncle Bob's **Screaming Architecture** principle says the use case should communicate its decisions to the caller. This is now implemented — the use case returns both `requestedCount` and `actualCount`.

## Impact (Pre-Fix)

- **User surprise**: Session started with fewer questions than expected; no explanation
- **Silent truncation**: Could lead users to think the system is broken or that they've already answered everything

---

## What Was Implemented

### Step 1: Use Case Output Enriched (Done)

`StartPracticeSessionUseCase` returns `requestedCount` and `actualCount` alongside `sessionId`:

```typescript
// src/application/use-cases/start-practice-session.ts
export type StartPracticeSessionOutput = {
  sessionId: string;
  requestedCount: number;
  actualCount: number;
};
```

### Step 2: Controller Surfaces Metadata (Done)

The practice controller returns `StartPracticeSessionOutput` directly to the client, including shortfall metadata.

### Step 3 (Superseded): Pre-Start Count Display Instead of Post-Creation Toast

The original proposal was a post-creation toast ("Only 30 matched your filters"). This was **superseded** by a pre-start available count display, which is a better UX — users see the count *before* starting, not after.

**What was built instead:**

1. **`CountAvailableQuestionsUseCase`** — backend use case that counts published candidate IDs matching the current filter combination
2. **`countAvailableQuestions` server action** — controller endpoint for the count query
3. **`usePracticeAvailableQuestionsCount` hook** — client hook that debounces filter changes (200ms) and queries the server for real-time counts
4. **`PracticeSessionStarter` component** — displays contextual messages next to the Start button:
   - `"Counting questions…"` — while the count query is in flight
   - `"N questions available."` — when requested count <= available
   - `"Only N questions available. Starting session with N."` — when requested count > available (the key shortfall message)
   - `"No questions match your filters."` — when nothing matches (Start button disabled)
   - `"Question count unavailable."` — on error (graceful degradation)

This approach was originally described as the "Alternative Approach: Pre-Start Count (BS-015)" in the initial brainstorming. BS-015 was never created as a separate document — the implementation went directly into code.

---

## Future Improvements (Not Yet Implemented)

These are UX polish ideas that may be worth revisiting in future versions. None are bugs — the current behavior is functional and communicative.

### 1. Dynamic Input Capping

Auto-set the question count input's `max` attribute to the available count so users can't type a number higher than what's available. Currently the input allows 1–100 regardless of filter results.

**Trade-off:** Could feel restrictive if the count updates lag behind filter changes. The current "Only N available" message is non-blocking and informative without constraining the input.

### 2. Disable Start When Count > Available

Currently Start is only disabled when `availableCount === 0`. Could also disable (or show a warning state) when the requested count exceeds available.

**Trade-off:** The session still works fine with fewer questions — it's not an error state. Disabling Start might over-communicate.

### 3. Per-Tag Question Counts (Issue #53)

Show the number of questions next to each tag chip (e.g., "Pharmacology (42)"). This helps users understand filter impact before selecting. Related to GitHub Issue #53.

**Trade-off:** Requires an additional query or pre-computed counts. May add visual noise to the tag section.

### 4. Post-Creation Toast (Original BS-014 Step 3)

Even with the pre-start count, a post-creation toast could serve as a secondary confirmation when `actualCount < requestedCount`. Low priority since the pre-start message already communicates this.

---

## Open Questions

1. **How do professional question banks handle this?** UWorld, Amboss, Kaplan — do they show available counts? Cap the input? Both? Research could inform future UX iterations.

---

## Verification

- [x] `StartPracticeSessionUseCase` returns `requestedCount` and `actualCount`
- [x] `CountAvailableQuestionsUseCase` counts candidates matching filters
- [x] `usePracticeAvailableQuestionsCount` hook queries server on filter change
- [x] UI shows "Only N questions available. Starting session with N." when count > available
- [x] UI shows "No questions match your filters." when 0 available
- [x] Start button disabled when 0 questions available

## Related

- `src/application/use-cases/start-practice-session.ts` — returns `requestedCount` + `actualCount`
- `src/application/use-cases/count-available-questions.ts` — pre-start count query
- `src/adapters/controllers/practice-controller.ts` — `startPracticeSession` + `countAvailableQuestions` actions
- `app/(app)/app/practice/hooks/use-practice-available-questions-count.ts` — debounced count hook
- `app/(app)/app/practice/components/practice-session-starter.tsx` — `availableCountMessage` rendering
- `app/(app)/app/practice/practice-page-available-count.ts` — effect with debounce + timeout
- Issue #53 (Tag question counts — related pre-start count feature)
- SPEC-013 (Practice Sessions)
