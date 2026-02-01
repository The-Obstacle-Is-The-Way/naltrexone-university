# BUG-006: Dark Theme Tokens Not Applied Due to Missing `.dark` Toggle + Overriding Body Classes

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-01
**Resolved:** 2026-02-01

## Summary

The CSS theme system defines `:root` tokens, `.dark` overrides, and sets `body` to `bg-background text-foreground` via `app/globals.css`. However:

1. Dark variants are configured to depend on a `.dark` ancestor (class-based dark mode), but the app never sets `.dark`.
2. The app hard-coded light theme classes (`bg-gray-*`, `bg-white`, `text-gray-*`) in layout/pages, overriding token-driven styles and making dark mode unreachable/inconsistent.

Net result: dark theme styles are effectively unreachable/inconsistent.

## Locations

- **Theme tokens + `.dark` variables:** `app/globals.css` lines 84-154
- **Theme applied to body:** `app/globals.css` line 161-163
- **Dark class toggle + theme base:** `app/layout.tsx`
- **Hard-coded light overrides (removed):** `app/page.tsx`, `app/pricing/page.tsx`, `app/sign-in/**`, `app/sign-up/**`

## Impact

- Dark mode does not work as intended.
- Theme token system is partially dead code (hard to reason about future styling).
- Visual inconsistency (background/text colors not driven by a single source of truth).

## Fix

1. Remove hard-coded light theme classes that override token-driven styles.
2. Implement a deterministic dark-mode strategy.

Resolved by:

- Adding an inline `<script>` in `app/layout.tsx` that sets `.dark` on `<html>` when the OS prefers dark.
- Removing `bg-gray-50` from the root layout and converting key pages to token-driven classes (`bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, etc.).

## Acceptance Criteria

- Dark mode can be activated deterministically (toggle or OS setting).
- Background/text colors are consistent with the theme tokens (`bg-background`, `text-foreground`).
- No layout-level classes override the token-driven base styles unintentionally.

## Regression Test

- E2E: `tests/e2e/dark-mode.spec.ts`
