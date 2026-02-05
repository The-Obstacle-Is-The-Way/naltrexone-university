# BUG-058: Theme Toggle Does Not Work Without ThemeProvider

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

The app layout includes a theme toggle button, but clicking it did not change the theme and user preferences were not persisted.

Additionally, the site always applied theme based only on OS preference, ignoring any stored user preference (e.g., `localStorage.theme = 'dark'`).

---

## Steps to Reproduce

1. Visit any page that renders the app header (e.g., `/app/dashboard`).
2. Click the theme toggle button.
3. Observe that the theme does not change.
4. Set `localStorage.theme = 'dark'`, reload with OS set to light.
5. Observe that the page still renders in light mode.

---

## Root Cause

- `components/theme-toggle.tsx` uses `next-themes` (`useTheme()`), but the root layout did not include a `ThemeProvider`, so `setTheme()` was a no-op.
- `app/layout.tsx` injected an OS-only theme script that toggled `.dark` purely from `prefers-color-scheme`, so persisted preference could never take effect.

---

## Fix

- Wrap the root layout with `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) to provide the `next-themes` context and persistence.
- Remove the custom OS-only theme script so `next-themes` is the single source of truth for initial theme application and preference changes.

---

## Verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test --run`
- [x] `pnpm test:browser`
- [x] `NEXT_PUBLIC_SKIP_CLERK=true pnpm test:e2e tests/e2e/theme-preference.spec.ts tests/e2e/dark-mode.spec.ts`

---

## Related

- `app/layout.tsx`
- `components/theme-toggle.tsx`
- `components/theme-provider.tsx`
- `docs/specs/spec-018-ui-integration.md` (Theme Strategy)

