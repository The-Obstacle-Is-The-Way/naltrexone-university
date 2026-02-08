# DEBT-179: `global-error.tsx` Missing `<head>` and `suppressHydrationWarning`

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

`app/global-error.tsx` renders `<html lang="en"><body>` but omits:

1. A `<head>` element — no `<title>`, `<meta charset>`, or viewport meta tag. This produces invalid HTML when the global error fires, since the root layout is unmounted and `global-error.tsx` must render the full HTML shell.
2. `suppressHydrationWarning` on the `<html>` element — the root layout at `app/layout.tsx:34` includes this (required for next-themes to inject the `class` attribute), but the global error boundary does not.

## Impact

- When the global error fires, the page has no `<title>` (tab shows the raw URL) and no viewport meta (mobile rendering breaks).
- Hydration mismatch warning may fire if next-themes has already injected a class on `<html>` before the error boundary replaces it.

## Resolution

1. Add a `<head>` block to `app/global-error.tsx`:
   ```tsx
   <html lang="en" suppressHydrationWarning>
     <head>
       <title>Error - Addiction Boards</title>
     </head>
     <body className="min-h-[100dvh] bg-background text-foreground">
   ```
2. Keep all existing error content and styling unchanged.

## Verification

- [ ] `app/global-error.tsx` renders `<html>` with `suppressHydrationWarning`
- [ ] `app/global-error.tsx` has a `<head>` with at minimum `<title>`
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/global-error.tsx`
- `app/layout.tsx` (reference for `suppressHydrationWarning` usage)
- Frontend tracker: FE-039
