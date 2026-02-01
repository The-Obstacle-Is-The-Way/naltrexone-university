# BUG-006: Dark Theme Tokens Not Applied Due to Missing `.dark` Toggle + Overriding Body Classes

**Status:** Open
**Priority:** P4
**Date:** 2026-02-01

## Summary

The CSS theme system defines `:root` tokens, `.dark` overrides, and sets `body` to `bg-background text-foreground` via `app/globals.css`. However:

1. Dark variants are configured to depend on a `.dark` ancestor (class-based dark mode), but the app never sets `.dark`.
2. `app/layout.tsx` sets `body` to `bg-gray-50`, which overrides `bg-background` and prevents theme tokens from controlling the page background.

Net result: dark theme styles are effectively unreachable/inconsistent.

## Locations

- **Theme tokens + `.dark` variables:** `app/globals.css` lines 84-154
- **Theme applied to body:** `app/globals.css` line 161-163
- **Body class overrides theme:** `app/layout.tsx` line 24

## Impact

- Dark mode does not work as intended.
- Theme token system is partially dead code (hard to reason about future styling).
- Visual inconsistency (background/text colors not driven by a single source of truth).

## Fix

1. Remove the overriding body background class in `app/layout.tsx` (or replace with `bg-background`).
2. Decide and implement the dark-mode strategy:
   - **Class-based**: implement a toggle that adds/removes `.dark` on `<html>` (and persist preference).
   - **Media-based**: switch variant strategy so `dark:` tracks `prefers-color-scheme`.

## Acceptance Criteria

- Dark mode can be activated deterministically (toggle or OS setting).
- Background/text colors are consistent with the theme tokens (`bg-background`, `text-foreground`).
- No layout-level classes override the token-driven base styles unintentionally.

