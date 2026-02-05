# BUG-059: Marketing Homepage Low Contrast in Light Mode

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

In light mode, the marketing homepage hero used dark-theme color utilities (e.g., `text-zinc-100`) on a light background (`bg-background`), which made key text (notably “Master Your”) extremely low-contrast and effectively unreadable.

This is a front-door UX defect: the homepage should be readable regardless of OS/theme preference.

---

## Steps to Reproduce

1. Ensure the site renders in light mode (OS prefers light, or `localStorage.theme = 'light'`).
2. Visit `/`.
3. Observe the “Master Your” hero text is near-invisible and several sections use a dark-only palette.

---

## Root Cause

The imported v0 marketing template was adapted into `components/marketing/marketing-home.tsx` but retained hard-coded zinc palette classes that assumed a dark background, rather than using the app’s theme tokens (`bg-background`, `text-foreground`, `border-border`, etc.).

---

## Fix

- Replace hard-coded zinc palette classes with theme-token utilities so the marketing page renders correctly in both light and dark mode:
  - `text-foreground`, `text-muted-foreground`
  - `bg-card`, `bg-muted`, `border-border`
- Add focus-visible styles on CTAs to preserve accessibility affordances while refactoring classes.

---

## Verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test --run`
- [x] `NEXT_PUBLIC_SKIP_CLERK=true pnpm test:e2e tests/e2e/marketing-contrast.spec.ts tests/e2e/smoke.spec.ts`

---

## Related

- `components/marketing/marketing-home.tsx`
- `tests/e2e/marketing-contrast.spec.ts`

