# BUG-100: Nested `<main>` Landmarks Across Root and Segment Layouts

**Status:** Open
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

1. Keep exactly one `<main>` per rendered route tree
2. Move `id="main-content"` to the route-level main container that owns page content
3. Replace one of the current main wrappers with a semantic-neutral container (`div`) where appropriate
4. Add regression tests that assert a single `<main>` landmark in rendered output for app and marketing routes

## Verification

- [ ] App route render contains exactly one `<main>` landmark
- [ ] Marketing home render contains exactly one `<main>` landmark
- [ ] Skip link still targets the active content landmark correctly
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `app/layout.tsx`
- `app/(app)/app/layout.tsx`
- `components/marketing/marketing-home.tsx`
- `docs/debt/debt-148-minimal-aria-accessibility-app-pages.md`
