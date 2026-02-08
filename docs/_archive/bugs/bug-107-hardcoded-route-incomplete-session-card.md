# BUG-107: Hardcoded Route Path in Incomplete Session Card

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Resolved:** 2026-02-08

---

## Description

`IncompleteSessionCard` uses a hardcoded route path instead of the centralized `ROUTES` constants:

```tsx
<Link href={`/app/practice/${input.session.sessionId}`}>
```

All other route references in the codebase use `ROUTES.APP_PRACTICE` or `toPracticeSessionRoute()`. This component was likely created during or after BUG-097 route-constant sweep and was missed.

**Observed:** Hardcoded `/app/practice/` string in component.

**Expected:** Should use centralized route constant (e.g., `ROUTES.APP_PRACTICE` or a route builder).

## Root Cause

Component was added during SPEC-020 practice UX redesign and missed the BUG-097 route-constant sweep.

## Impact

- Route changes would require manual updates to this file
- Inconsistent with codebase pattern established in BUG-097

## Fix

Replaced the hardcoded path with the route builder:

- `Link href={toPracticeSessionRoute(input.session.sessionId)}`

## Verification

- [x] Replace with centralized route builder
- [x] Existing component browser test still passes with expected route output

## Related

- `app/(app)/app/practice/components/incomplete-session-card.tsx:31`
- `app/(app)/app/practice/components/incomplete-session-card.browser.spec.tsx`
- BUG-097 (widespread hardcoded route strings)
