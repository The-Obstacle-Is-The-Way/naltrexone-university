# DEBT-217: History Back Link Loses Tab and Filter State

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-14
**Resolved:** 2026-02-15
**GitHub Issue:** —

---

## Description

Previously, navigating from **History** to a question detail page and clicking **Back to History** lost:

- **Tab state** (Questions vs Sessions)
- **List state**: pagination (`limit`, `offset`) and History Questions filters (`result`, `source`, `difficulty`, `tag`)

This was most visible from **History → Questions** because History defaults to the Sessions tab when `?tab=` is missing.

## Root Cause (Pre-Resolution)

- **History → Questions** links only carried `from=history&mode=review` (no History URL context).
- The question page built **Back to History** as a generic `/app/history` when `sessionId` was absent.
- `parseHistoryTab()` defaults to Sessions when `tab` is missing.

## Resolution

Thread a single canonical `historyHref` (relative `/app/history?...`) through question routes and use it as the SSOT for the back link.

### Implementation (What Changed)

- `lib/routes.ts#L25`: `toQuestionRoute()` now accepts `historyHref?: string` and encodes it into the question URL query string.
- `app/(app)/app/history/components/history-questions-tab.tsx#L106` + `app/(app)/app/history/components/history-questions-tab.tsx#L301`:
  - Builds `historyHref` via `buildHistoryQuestionsHref({ limit, offset, filters })`.
  - Threads it into `toQuestionRoute(..., { historyHref })` so filters + pagination round-trip.
- `app/(app)/app/history/components/history-sessions-tab.tsx#L55` + `app/(app)/app/history/components/history-sessions-tab.tsx#L119`:
  - Builds `historyHref` via `buildHistorySessionsHref({ limit, offset })`.
  - Threads it through `SessionBreakdownList`.
- `app/(app)/app/shared/components/session-breakdown-list.tsx#L8` + `app/(app)/app/shared/components/session-breakdown-list.tsx#L28`:
  - Accepts `historyHref?: string` and passes it into `toQuestionRoute`.
- `app/(app)/app/questions/[slug]/page.tsx#L14`:
  - Extracts `historyHref` from search params and passes it into `QuestionPageClient`.
- `app/(app)/app/questions/[slug]/question-page-client.tsx#L34` + `app/(app)/app/questions/[slug]/question-page-client.tsx#L41`:
  - Validates `historyHref` to only allow `'/app/history?tab=sessions|questions...'` (guards against open-redirect-style back links).
  - Prefers `historyHref` for the History back link; falls back to `?tab=sessions` when `sessionId` exists, otherwise `?tab=questions`.
- `app/(app)/app/questions/[slug]/question-page-client.tsx#L90`:
  - Threads `historyHref` into SessionNavigationBar prev/next links so the param survives sequential review navigation.

### Behavior Now

- **History → Questions → question → Back to History** returns to the canonical History Questions URL (tab + pagination + filters).
- **History → Sessions → breakdown question → Back to History** returns to the canonical History Sessions URL (tab + pagination).
- **Older links** that lack `historyHref` still return to the correct tab via History fallbacks:
  - no `sessionId` → `?tab=questions`
  - `sessionId` present → `?tab=sessions`

### Explicit Non-Goals

- Restoring the “expanded session” UI state on the Sessions tab (that state is client-only in `useHistorySessions()` and requires separate URL-state design).

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --run`
- `pnpm test:browser`
- `pnpm build`

## Related

- DEBT-206: History Questions filters became server-side (4 filters to preserve).
- DEBT-208: Cross-page navigation E2E coverage (updated to assert canonical History return URLs).
