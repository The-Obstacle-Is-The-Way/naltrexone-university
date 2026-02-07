# DEBT-144: Hardcoded Colors Bypass Design System Tokens

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

Multiple components use hardcoded Tailwind color classes (`emerald-*`, `red-*`, `amber-*`, `zinc-*`) instead of the semantic design system tokens defined in `tailwind.config.ts` (`destructive`, `muted-foreground`, etc.). This bypasses the theme system, makes dark mode fragile, and creates maintenance burden.

## Impact

- Dark mode inconsistency: hardcoded `bg-emerald-50` renders as a light green box on a dark background
- Theme changes require grep-and-replace across 10+ files instead of updating CSS custom properties
- Design system regression test (`components/theme-token-regression.test.tsx`) doesn't catch all instances

## Affected Files

| File | Lines | Hardcoded Colors |
|------|-------|-----------------|
| `components/question/ChoiceButton.tsx` | 33, 35, 53, 55 | `emerald-500`, `emerald-50`, `red-500`, `red-50` |
| `components/question/Feedback.tsx` | 45, 47 | `emerald-200`, `emerald-50`, `red-200`, `red-50` |
| `app/(app)/app/billing/page.tsx` | 81 | `amber-200`, `amber-50`, `amber-900` |
| `app/pricing/pricing-view.tsx` | 52, 159 | `red-200`, `red-700`, `emerald-600` |
| `app/not-found.tsx` | 9 | `zinc-500` (should be `muted-foreground`) |

## Resolution

1. Added semantic `success`/`warning` tokens in `app/globals.css` (`--color-success`, `--color-warning`, foreground variants) for light/dark themes
2. Replaced hardcoded `emerald/red/amber/zinc` classes with semantic tokens in:
   - `components/question/ChoiceButton.tsx`
   - `components/question/Feedback.tsx`
   - `app/(app)/app/billing/page.tsx`
   - `app/pricing/pricing-view.tsx`
   - `components/marketing/marketing-home.tsx`
   - `app/not-found.tsx`
3. Extended token regression coverage in `components/theme-token-regression.test.tsx`

## Verification

- [x] `rg "(emerald|amber|red|zinc)-" app components --glob '!**/*.test.*'` returns no matches
- [x] Token regression tests assert semantic classes for question feedback + billing/pricing states
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- DEBT-146: Missing semantic success/warning tokens
- DEBT-108 (archived): Hardcoded zinc colors break light/dark toggle
- `tailwind.config.ts` — theme configuration
- `globals.css` — CSS custom properties
