# BUG-273: `app/not-found.tsx` Is the Only Page Missing Per-Page Metadata

**Status:** Open
**Severity:** P3
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Marketing / Routing / Metadata

---

## Summary

Every route in the app exports a distinct `metadata` object except `app/not-found.tsx`, which has none. A 404 therefore renders with the root layout's generic title ("Addiction Boards Question Bank") instead of a distinct, accurate title.

## Reachability

Reachable on every 404 — a typo'd URL, a stale bookmark, or a link to removed content.

## Reproduction

1. Visit any nonexistent path, e.g. `/this-does-not-exist`.
2. Inspect the browser tab title / page `<title>`.

Expected: a distinct title indicating the page was not found, consistent with how every other page titles itself.

Actual: the tab shows the generic site title inherited from the root layout, with no indication this is a 404 until the page body is read.

## Root Cause

- [`app/not-found.tsx`](../../app/not-found.tsx) has no `export const metadata`. It is a plain Server Component (no `'use client'` directive), so nothing prevents adding one — unlike `app/error.tsx`/`app/global-error.tsx`, which both open with `'use client';` as their first line and therefore genuinely cannot export Next.js `metadata` (and `global-error.tsx` correctly compensates by hand-rendering its own `<title>` in its required full HTML document shell, per the already-shipped FE-039/DEBT-179 fix).
- All 13 other `page.tsx` files in `app/` export `metadata` — `not-found.tsx` is the sole exception — and every one of them follows the identical convention `'<Page Title> - Addiction Boards'` (e.g. `'Home - Addiction Boards'`, `'Pricing - Addiction Boards'`, `'Dashboard - Addiction Boards'`, `'Practice - Addiction Boards'`, `'Question - Addiction Boards'`). There is no `title: { template }` on the root layout, so this suffix is applied manually per page, not automatically.

## Impact

Cosmetic / SEO-only. No functional impact — the page renders correctly and is fully usable; only the browser tab title and any SEO/social-preview metadata for a 404 response are generic instead of distinct. Graded P3 (not P4) per this repo's own rubric wording — "minor issue, cosmetic" — matching how every other UX/cosmetic finding in this same sweep (BUG-271, BUG-275, BUG-276) was graded, rather than P4 ("trivial, nice to have").

## Proposed Fix

Add `export const metadata: Metadata = { title: 'Page Not Found - Addiction Boards' };` to `app/not-found.tsx`, matching the naming convention followed by all 13 other pages (a bare `'Page Not Found'` would be the only page in the app breaking that convention). No other page sets a `description`, so omitting one here is consistent. A `robots: { index: false }` addition is a defensible real-world 404 best practice, but Next's `not-found.tsx` already returns a true HTTP 404 status, so this is optional polish, not a functional gap.

Rejected alternatives:
- None considered — this is a single-line, low-risk addition with no meaningful alternative approach.

## Failing Test Sketch

```ts
it('exports distinct metadata for the not-found page, matching the app-wide title convention', async () => {
  const { metadata } = await import('@/app/not-found');
  expect(metadata?.title).toBe('Page Not Found - Addiction Boards');
});
```

Today this fails because `app/not-found.tsx` exports no `metadata`.

## Related

- FE-039 / DEBT-179 (`global-error.tsx` missing `<head>`/hydration metadata) is the adjacent, already-fixed precedent for per-page metadata correctness on the error-boundary family of pages; this extends the same bar to `not-found.tsx`.
