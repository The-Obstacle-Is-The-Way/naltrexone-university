# BUG-060: Question Reattempt Submit Not Disabled While Loading

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

On the question reattempt page (`/app/questions/[slug]`), the **Submit** button remained enabled while a submission was in-flight (`loadState.status === 'loading'`).

This allowed rapid repeat clicks, potentially triggering:

- duplicate network requests
- idempotency conflicts (e.g., “Request is already in progress”)
- avoidable rate-limit errors

---

## Steps to Reproduce

1. Visit `/app/questions/<slug>`.
2. Select an answer choice.
3. Click **Submit** repeatedly while the request is in-flight (slow network makes this obvious).
4. Observe duplicate submissions or error states.

---

## Root Cause

`QuestionView` disabled the Submit button only when `!canSubmit || isPending`, but did not include `loadState.status === 'loading'` in the disabled condition (unlike the practice flow, which blocks submits while loading).

---

## Fix

- Disable the Submit button while `loadState.status === 'loading'`.
- Add a render-output regression test asserting the Submit button renders with the `disabled` attribute when in loading state.

---

## Verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test --run`

---

## Related

- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `app/(app)/app/questions/[slug]/page.test.tsx`

