# DEBT-207: No Warning When Practice Session Has Fewer Questions Than Requested

**Status:** Open
**Priority:** P3
**Date:** 2026-02-11
**GitHub Issue:** #82

---

## Description

When a user requests a 50-question practice session but their filter combination (tags + difficulty) only matches 30 questions, the session is silently created with 30 questions. The backend correctly uses `Math.min(count, candidateIds.length)`, but the user receives no indication that their session is shorter than requested.

### Clean Architecture Analysis

The use case layer already knows when `actual < requested` — it computes `Math.min()`. Uncle Bob's **Screaming Architecture** principle says the use case should communicate its decisions to the caller. Currently, the use case returns a session object without any metadata about the shortfall. The presentation layer has no way to know the user asked for 50 but got 30.

## Impact

- **User surprise**: Session starts with fewer questions than expected; no explanation
- **Silent truncation**: Could lead users to think the system is broken or that they've already answered everything

## Resolution

### Step 1: Enrich the Use Case Output

Return a `requestedCount` alongside the session so the controller can detect a shortfall:

```typescript
// In StartPracticeSessionUseCase output
export type StartPracticeSessionOutput = {
  session: PracticeSession;
  requestedCount: number;  // What the user asked for
  actualCount: number;     // What was available
};
```

This keeps the domain clean — the use case reports facts; the UI decides how to present them.

### Step 2: Surface in the Controller

The practice controller should return the shortfall metadata to the client:

```typescript
return {
  sessionId: result.session.id,
  questionCount: result.actualCount,
  requestedCount: result.requestedCount,
  hasFewerQuestions: result.actualCount < result.requestedCount,
};
```

### Step 3: Show a Toast in the UI

When `hasFewerQuestions` is true, display a brief informational toast:

> "Only 30 questions matched your filters. Starting session with 30 questions."

Use the existing toast/notification system. This is a non-blocking notice — the session still starts.

### Alternative Approach: Pre-Start Count (DEBT-209)

Instead of post-creation notice, add a "preview" query before session creation that counts available questions for the current filters. Display the count next to the "Start" button: "42 questions available." This aligns with Issue #53 (question counts per tag) and is tracked as DEBT-209. If DEBT-209 is implemented first, this warning becomes a best-effort fallback for edge cases rather than the primary UX fix.

## Verification

1. New unit test: `StartPracticeSessionUseCase` returns `requestedCount` and `actualCount`
2. New component test: toast appears when `actualCount < requestedCount`
3. Manual: select filters that limit available questions → start session → see notice

## Related

- `src/application/use-cases/start-practice-session.ts` — `Math.min(count, candidateIds.length)`
- `src/adapters/controllers/practice-controller.ts` — `startPracticeSession` action
- Issue #53 (Tag question counts — related pre-start count feature)
- SPEC-013 (Practice Sessions)
