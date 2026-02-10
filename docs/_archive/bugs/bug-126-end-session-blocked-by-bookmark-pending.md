# BUG-126: End Session Blocked During Bookmark Operations

**Status:** Reclassified
**Priority:** P2
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

This item claimed that "End session" / "Review answers" was disabled while a bookmark toggle was pending.

## Root Cause

The report assumed bookmark operations were wrapped in React transitions and therefore shared a single `isPending` flag with question submission/navigation.

## Resolution

Reclassified as **not reproducible** in the current implementation:

- Bookmark operations use their own `bookmarkStatus` state, not `startTransition`.
- The session end action is disabled only by the question-flow pending state, not bookmark load/toggle state.

Added a browser regression test asserting that toggling a bookmark does **not** set the controller's transition pending state:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

## Verification

- `pnpm test:browser`

