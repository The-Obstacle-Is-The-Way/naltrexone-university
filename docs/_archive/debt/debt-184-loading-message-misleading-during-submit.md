# DEBT-184: Loading Message Misleading During Answer Submission

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

When a user submits an answer, `loadState` transitions to `{ status: 'loading' }`, which renders the same loading card as question fetching. The loading card displays "Loading question..." text via a `<output>` element (implicit `aria-live`).

This means screen readers announce "Loading question..." when the user is actually submitting an answer — semantically incorrect.

**Files:**
- `app/(app)/app/practice/components/practice-view.tsx` (~line 125): renders "Loading question..." for any `status === 'loading'`
- `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`: sets `loadState` to `'loading'` for both question fetch AND answer submit

## Impact

- Screen reader users hear incorrect status during answer submission.
- Sighted users briefly see "Loading question..." flash when they're submitting an answer.
- Minor but affects perceived quality.

## Resolution

Distinguish between "loading a question" and "submitting an answer" in the loading state. Options:

1. **Add a `loadingReason` to the `LoadState` type:** `{ status: 'loading', reason: 'fetching' | 'submitting' }`. Render different text based on reason.
2. **Use `isPending` from `useTransition` for submit loading:** The submit already uses `useTransition`'s `isPending`. Show a spinner on the submit button instead of replacing the question card with a loading card.

Implemented Option 2:

1. Submit flows now run inside `startTransition` in both:
   - `use-practice-question-answer-flow.ts`
   - `use-practice-session-question-flow.ts`
2. Shared submit action no longer sets `loadState` to `'loading'` during answer submission.
3. `PracticeView` now shows `Submitting…` on the submit button while submit is pending.

## Verification

- [x] Submitting an answer does NOT show "Loading question..." text
- [x] Screen readers announce appropriate status during submission via submit button text (`Submitting…`)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`
- `app/(app)/app/shared/load-state.ts`
- [Practice Engine](../../practice-engine/index.md) Section 9.2
- Frontend tracker: FE-044
