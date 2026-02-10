# BUG-125: "No More Questions" Dead-End — No Action Buttons

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

When the server returned `null` for the next question (all questions answered), the main content showed "No more questions found." but did not include any obvious CTA to end the session / review answers. Users could miss the small header action.

## Root Cause

`PracticeView` only rendered the main action bar when `question !== null`, leaving the empty state without a primary action.

## Resolution

When `question === null` and `onEndSession` exists, render an explicit session action button inside the empty-state card (in addition to the header action).

Key files:

- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/components/practice-view.test.tsx`

## Verification

- `pnpm test --run`

