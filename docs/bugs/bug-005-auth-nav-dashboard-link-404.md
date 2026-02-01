# BUG-005: Signed-in Nav Links to Missing `/app/dashboard` Route (404)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

When a user is signed in, the nav renders a **Dashboard** link to `/app/dashboard`, but no Next.js route exists for `/app/dashboard` yet. Clicking the link yields a 404.

## Location

- **File:** `components/auth-nav.tsx`
- **Link:** `href="/app/dashboard"` (removed)

## Impact

- Signed-in users see a primary CTA that leads to a dead route.
- Creates a false sense that the “app” experience exists and is reachable.
- Adds noise during QA / E2E smoke runs that include signed-in navigation.

## Repro

1. Sign in successfully (real Clerk keys; not `NEXT_PUBLIC_SKIP_CLERK=true`).
2. Visit `/`.
3. Click **Dashboard** in the top-right nav.
4. Observe a 404.

## Fix

Choose one (and document it in SSOT if needed):

1. **Implement the route now**: add a minimal `app/(app)/app/dashboard/page.tsx` page (even a placeholder) so the link is never broken.
2. **Hide the link until the route exists**: replace the signed-in Dashboard link with an existing route (or remove it) until SLICE-5 is implemented.

Resolved via option 2: the signed-in nav no longer renders a link to `/app/dashboard`.

## Acceptance Criteria

- Signed-in users can navigate to `/app/dashboard` without a 404, or the UI no longer renders a link to a missing route.
- Add/extend E2E coverage once `/app/dashboard` exists (see SPEC-015).

## Regression Test

- Unit: `components/auth-nav.test.tsx`
