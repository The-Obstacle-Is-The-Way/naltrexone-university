# BUG-122: Choices Still Clickable After Exam Mode Submit

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

In exam sessions, after an answer was submitted, users could still interact with choice radios in some navigation paths (most commonly when re-opening an already-answered question). This created confusing UI state and could lead to CONFLICT errors on re-submit.

## Root Cause

The client did not reliably restore the authoritative "answered" state when loading an already-answered question. Without restoring `selectedChoiceId` / submit state, the UI treated the question as unanswered and left inputs enabled.

## Resolution

- Return the authoritative answered state from the server (`getNextQuestion`) and restore it on the client with an explicit `isAnswered` flag.
- Keep choice inputs locked after submit by treating restored answered state as "answer locked" in `PracticeView`.
- Added browser regression coverage for disabled choices in exam mode after a submit.

Key files:

- `src/application/use-cases/get-next-question.ts`
- `app/(app)/app/practice/shared/use-question-flow-core.ts`
- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx`

## Verification

- `pnpm test --run`
- `pnpm test:browser`

