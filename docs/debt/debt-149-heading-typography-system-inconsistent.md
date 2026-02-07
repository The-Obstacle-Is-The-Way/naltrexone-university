# DEBT-149: Heading Typography System Inconsistent

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The app has multiple heading patterns with no clear rule governing which to use. The canonical app-page pattern (`text-2xl font-bold font-heading tracking-tight text-foreground`) is used by most app pages but not all, creating visual inconsistency when navigating between pages.

## Patterns Found

| Pattern | Classes | Where Used |
|---------|---------|------------|
| A (canonical) | `text-2xl font-bold font-heading tracking-tight text-foreground` | Dashboard, Bookmarks, Review, Practice, Questions, Session Summary, Exam Review |
| B (missing font-heading) | `text-2xl font-semibold text-foreground` | Billing page (`app/(app)/app/billing/page.tsx:135`) |
| C (auth/checkout) | `text-xl font-semibold text-foreground` | Sign In (`app/sign-in/[[...sign-in]]/page.tsx`), Sign Up (`app/sign-up/[[...sign-up]]/page.tsx`), Checkout Success |
| D (marketing) | `text-4xl font-bold tracking-tight text-foreground` | Pricing (`app/pricing/pricing-view.tsx:39`), Not Found (`app/not-found.tsx:14`) |
| E (error pages) | `text-2xl font-bold` | Global Error (`app/global-error.tsx:23`) — missing `text-foreground` |

### Specific Inconsistencies

1. **Billing page** is the most jarring — it's an app page like Dashboard/Bookmarks/Review but uses Pattern B instead of Pattern A (missing `font-heading`, `tracking-tight`, uses `font-semibold` instead of `font-bold`)
2. **`font-heading`** is applied to core app-page h1s but missing from Billing, Pricing, Not Found, Global Error, and auth pages
3. **`tracking-tight`** is always paired with `font-heading` on app pages but sometimes appears without it on marketing pages
4. **`text-foreground`** is missing from Global Error h1
5. **Pricing h3s** (`app/pricing/pricing-view.tsx:125,150`) use `text-lg font-semibold text-foreground` while marketing h3s (`components/marketing/marketing-home.tsx:183,211,234`) use `font-heading font-semibold text-foreground`
6. **Error page h2s** (9 instances across all error.tsx files) use `text-xl font-semibold` without `text-foreground`

## Impact

- Users navigating from Dashboard to Billing see a visible font change in the page title
- The heading hierarchy has no systematic rule — h1 ranges from `text-xl` to `text-5xl` depending on page
- New pages have no clear guidance on which pattern to follow, inviting further drift
- Marketing vs app distinction is reasonable, but within each context the rules should be consistent

## Resolution

1. Standardize all app-page h1s to Pattern A: `text-2xl font-bold font-heading tracking-tight text-foreground`
   - Fix: `app/(app)/app/billing/page.tsx:135`
2. Standardize all error-page headings to include explicit foreground color
   - Fix: all route-level `error.tsx` h2 headings + `app/global-error.tsx` h1
3. Standardize marketing h3s — decide whether pricing h3s should use `font-heading` (marketing h3s do)
   - Fix: `app/pricing/pricing-view.tsx:125,150`
4. Auth pages (Pattern C) can remain distinct — smaller `text-xl` is appropriate for centered auth cards
5. Consider extracting a `PageTitle` component or Tailwind `@apply` class to prevent future drift

## Verification

- [ ] All app-page h1s use identical classes (`text-2xl font-bold font-heading tracking-tight text-foreground`)
- [ ] All error-page headings include explicit `text-foreground`
- [ ] Pricing h3s match marketing h3 pattern (or decision documented)
- [ ] Visual regression check across Dashboard, Billing, Practice, Review, Bookmarks

## Related

- DEBT-144 (archived): Hardcoded colors bypass design system — same category of design consistency
- DEBT-146 (archived): Missing semantic success/warning tokens — design system gaps
