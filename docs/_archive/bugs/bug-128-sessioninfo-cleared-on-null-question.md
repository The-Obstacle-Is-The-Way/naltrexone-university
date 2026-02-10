# BUG-128: sessionInfo Cleared on Null Question — Exam Defaults to Tutor, Navigator Drops

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

When `getNextQuestion` returned `null` (all answered), the client cleared `sessionInfo`. This caused exam sessions to display tutor-mode headings and could drop the navigator (session metadata was lost).

## Root Cause

The session question-load flow overwrote `sessionInfo` with `null` whenever the loaded question was `null`, instead of preserving session metadata through end-of-session transitions.

## Resolution

Preserve existing `sessionInfo` when the server returns `null` for the next question.

Key files:

- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts`

## Verification

- `pnpm test --run`
- `pnpm test:browser`

