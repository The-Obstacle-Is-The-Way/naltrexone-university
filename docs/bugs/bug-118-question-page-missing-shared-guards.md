# BUG-118: Question Page Missing Shared Practice-Page Guards

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08

---

## Description

The standalone question page (`/app/questions/[slug]`) does not use the shared practice-page guard functions that prevent post-submission state inconsistency and double-click submission. Three specific guards are missing:

### 1. Missing `selectChoiceIfAllowed` guard

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`, line 235

The question page passes `setSelectedChoiceId` directly as `onSelectChoice`:

```tsx
onSelectChoice={setSelectedChoiceId}
```

The practice pages wrap this in `selectChoiceIfAllowed(submitResult, setSelectedChoiceId, choiceId)` which prevents choice selection after submission. While the `ChoiceButton` component disables radio inputs when `correctChoiceId !== null`, the state-level guard is missing.

### 2. Missing `startTransition` wrapper on submit

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`, lines 191-211

The `onSubmit` function is created via `useMemo(() => submitSelectedAnswer.bind(null, {...}), [...])`. Unlike the practice pages which use `runTransitionedAsyncAction({ startTransition, ... })`, the question page calls `submitSelectedAnswer` directly. The `isPending` flag (from `useTransition`) is never `true` during answer submission — only during initial question load.

### 3. Missing `loadState` check in `canSubmit`

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx`, lines 185-189

```typescript
const canSubmit = useMemo(() => {
  return question !== null && selectedChoiceId !== null && submitResult === null;
}, [question, selectedChoiceId, submitResult]);
```

Compare to practice pages which use `canSubmitAnswer()` from `practice-page-logic.ts`:

```typescript
if (input.loadState.status === 'loading') return false;  // THIS CHECK IS MISSING
```

## Impact

- After submitting an answer, a user can change their selected radio button (visual only — component-level `disabled` prevents actual re-submission)
- Brief double-click window exists before React processes `setLoadState({ status: 'loading' })`
- `isPending` is always `false` during submission, making any `isPending`-dependent UI feedback incorrect
- Server-side idempotency keys prevent duplicate submissions, so data integrity is preserved

## Root Cause

The question page was built as a standalone feature and did not adopt the shared guard utilities (`selectChoiceIfAllowed`, `canSubmitAnswer`, `runTransitionedAsyncAction`) that were later extracted for the practice session flows.

## Resolution

1. Replace `setSelectedChoiceId` with a wrapper using `selectChoiceIfAllowed`
2. Wrap `submitSelectedAnswer` in `runTransitionedAsyncAction` so `isPending` is `true` during submit
3. Replace inline `canSubmit` with `canSubmitAnswer()` from `practice-page-logic.ts`, or add `loadState.status === 'loading'` check

## Verification

- `pnpm test --run` — existing question page tests pass
- `pnpm test:browser` — browser specs for question page pass
- Manual test: rapidly double-click Submit on question page, verify no duplicate visual feedback

## Related

- FE-031 (question page controller extraction — would naturally address this)
- FE-045 (question flow hook unification)
