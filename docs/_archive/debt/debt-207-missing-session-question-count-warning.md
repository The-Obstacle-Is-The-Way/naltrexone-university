# DEBT-207: No Warning When Practice Session Has Fewer Questions Than Requested

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-13
**Resolved:** 2026-02-14
**GitHub Issue:** #82

---

## Description

When a user requested a practice session with `count=N` but their filters only matched fewer than `N` questions, the backend correctly created a shorter session, but the UI gave no indication that the session had been truncated.

This led to user surprise (“I requested 50 but got 30”) even though the session creation logic behaved correctly.

## Resolution

1. The application use case now returns both the requested and actual session sizes:
   - `StartPracticeSessionOutput.requestedCount`
   - `StartPracticeSessionOutput.actualCount`

2. The Practice page start flow appends `requestedCount` + `actualCount` query params to the existing `toast=session_started` navigation when `actualCount < requestedCount`.

3. The practice session page displays an informational toast when the shortfall is present:
   - “Only 30 of 50 questions matched your filters. Starting session with 30 questions.”

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm build`

## Related

- `docs/brainstorming/bs-014-practice-starter-question-count-ux.md`
- `src/application/use-cases/start-practice-session.ts`
- `src/adapters/controllers/practice-schemas.ts`
- `app/(app)/app/practice/practice-page-session-start.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx`

