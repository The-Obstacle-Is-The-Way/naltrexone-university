# BUG-100: Nested `<main>` Landmarks Across Root and Segment Layouts

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The root layout renders a global `<main id="main-content">`, and child app/marketing UI also renders `<main>` elements inside it. This creates nested main landmarks in the final HTML.

**Observed:** Pages can render more than one `<main>` with one `<main>` nested inside another.

**Expected:** Each document should expose one primary main landmark for assistive tech navigation.

## Steps to Reproduce

1. Run `pnpm dev`
2. Open `/app/dashboard`
3. Inspect rendered DOM and observe:
   - outer `<main id="main-content">` from `app/layout.tsx`
   - nested `<main ...>` from `app/(app)/app/layout.tsx`
4. Open `/` and observe nested `<main>` again via `components/marketing/marketing-home.tsx`

## Root Cause

Root layout wraps all routes in a top-level main landmark:

- `app/layout.tsx:44`

Segment/page UI also declares main landmarks:

- `app/(app)/app/layout.tsx:80`
- `components/marketing/marketing-home.tsx:90`

The current composition guarantees nested main landmarks for major route groups.

## Impact

- Screen-reader landmark navigation can become ambiguous
- Skip-link semantics are weakened because the first main wraps additional nested mains
- Accessibility quality regresses against modern semantic-landmark expectations

## Fix

1. Removed the root layout `<main>` wrapper from `app/layout.tsx` so route segments own the primary landmark.
2. Added `id="main-content"` and `tabIndex={-1}` to the app-shell main landmark in `app/(app)/app/layout.tsx`.
3. Added `id="main-content"` and `tabIndex={-1}` to the marketing-shell main landmark in `components/marketing/marketing-home.tsx`.
4. Added regression coverage:
   - `app/layout.test.tsx` verifies root layout no longer nests a second `<main>`.
   - `app/(app)/app/layout-shell.test.tsx` verifies app shell owns `#main-content`.
   - `components/marketing/marketing-home.test.tsx` verifies marketing shell owns `#main-content`.

## Verification

- [x] App route render contains exactly one `<main>` landmark
- [x] Marketing home render contains exactly one `<main>` landmark
- [x] Skip link still targets the active content landmark correctly
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `app/layout.tsx`
- `app/(app)/app/layout.tsx`
- `components/marketing/marketing-home.tsx`
- `docs/debt/debt-148-minimal-aria-accessibility-app-pages.md`
