# BUG-227: Header Brand Uses Body Font While Rest of App Uses Font System; Nav Items Wrap at Mid-Width Viewports

**Status:** Open
**Priority:** P3
**Date:** 2026-03-16

## Summary

The app header brand text ("Addiction Boards") renders in plain Manrope (body font) at `text-sm font-semibold`, while every page heading below it uses `font-heading` (Instrument Sans) and every stat/price uses `font-display` (Plus Jakarta Sans). This creates a visual disconnect where the brand feels "dinky" compared to page content. Additionally, at mid-width viewports (640–767px), multi-word nav items ("Quick Practice") and the brand text wrap to two lines with left-aligned text, producing uneven gaps and broken visual rhythm.

## Impact

- **Brand feels weak**: "Addiction Boards" in the header is visually indistinguishable from nav links — same font family, similar size/weight. It doesn't read as a brand mark.
- **Font system gap**: The codebase has a well-established 3-font system (`font-heading` for headings, `font-display` for stats/prices, Manrope for body), but the header — the most persistent UI element — doesn't participate in it.
- **Nav wrapping at sm breakpoint**: The desktop nav shows at `sm:` (640px), but 7 items at that width causes "Addiction Boards" and "Quick Practice" to wrap to two lines. The left-aligned text on wrapped items looks misaligned.
- **Affects both app and marketing headers**: The marketing header (`components/marketing/marketing-layout.tsx`) and marketing footer have the same brand font issue.

## Broader Design Concern (Documented, Not Addressed Here)

All three project fonts (Manrope, Instrument Sans, Plus Jakarta Sans) are geometric sans-serifs with similar proportions. Font pairing best practices recommend mixing font categories (e.g., sans + serif) for clear visual contrast. The current 3-font system works because each font is used in a distinct context (body vs. headings vs. numbers), but the similarity means the hierarchy is subtle rather than obvious. This is a known design limitation documented here for future consideration — a full font-system overhaul is out of scope for this fix.

## Affected Files

| File | Issue |
|------|-------|
| `app/(app)/app/layout.tsx:80` | Brand link: `text-sm font-semibold` in Manrope, no `font-heading` |
| `components/app-desktop-nav.tsx:19` | Desktop nav: `sm:flex` breakpoint too low; no `whitespace-nowrap` |
| `components/mobile-nav.tsx:106` | Mobile nav: `sm:hidden` breakpoint too low |
| `components/marketing/marketing-layout.tsx:18,28` | Marketing brand link: same plain Manrope issue |
| `components/marketing/marketing-layout.tsx:71` | Footer brand text: no `font-heading` |

## Root Cause

The header was built before the `font-heading` / `font-display` system was established and was never updated to use it. The `sm:` breakpoint (640px) was chosen as a generic mobile/desktop split but doesn't account for the actual content width of 7 nav items plus brand text.

## Stopgap Fix

These changes extend the existing font system to the header without rearchitecting the 3-font system:

### 1. Brand text: Apply `font-heading` + size bump

**Before:**
```tsx
className="rounded-md text-sm font-semibold text-foreground ..."
```

**After:**
```tsx
className="rounded-md text-base font-bold font-heading whitespace-nowrap text-foreground ..."
```

- `font-heading` (Instrument Sans) — matches page headings below
- `text-sm` → `text-base` — subtle size increase so brand reads as brand, not nav item
- `font-semibold` → `font-bold` — slightly more weight for brand presence
- `whitespace-nowrap` — prevents "Addiction Boards" from wrapping

### 2. Desktop nav breakpoint: `sm:` → `md:`

**Before:**
```tsx
className="hidden items-center gap-4 text-sm sm:flex"
```

**After:**
```tsx
className="hidden items-center gap-4 text-sm md:flex"
```

At 640–767px, show the mobile hamburger menu instead of cramming 7 items into insufficient space.

### 3. Mobile nav breakpoint: `sm:hidden` → `md:hidden`

Mirror the desktop breakpoint change so the hamburger menu shows below `md:`.

### 4. Nav links: Add `whitespace-nowrap`

Prevent "Quick Practice" from wrapping at any viewport width where the desktop nav is visible.

### 5. Marketing header + footer: Same brand treatment

Apply `font-heading font-bold text-base whitespace-nowrap` to the marketing header brand link and footer brand text for consistency.

## What This Does NOT Fix

- Does not change the 3-font system (Manrope / Instrument Sans / Plus Jakarta Sans)
- Does not add `font-heading` to nav links (research confirms body font is correct for nav readability)
- Does not touch page headings, stats, or pricing — those are already correct
- Does not address the broader font-similarity concern (documented above for future consideration)
