# BUG-227: Header Brand Uses Body Font While Rest of App Uses Font System; Nav Items Wrap at Mid-Width Viewports

**Status:** Open
**Priority:** P3
**Date:** 2026-03-16

## Summary

The app header brand text ("Addiction Boards") renders in plain Manrope (body font) at `text-sm font-semibold`, while every page heading below it uses `font-heading` (Instrument Sans) and every stat/price uses `font-display` (Plus Jakarta Sans). This creates a visual disconnect where the brand feels "dinky" compared to page content. Additionally, at mid-width viewports (640–767px), multi-word nav items ("Quick Practice") and the brand text wrap to two lines with left-aligned text, producing uneven gaps and broken visual rhythm.

## Impact

- **Brand feels weak**: "Addiction Boards" in the header is visually indistinguishable from nav links — same font family, similar size/weight. It doesn't read as a brand mark.
- **Font system gap**: The codebase has a well-established 3-font system (`font-heading` for headings, `font-display` for stats/prices, Manrope for body), but the header — the most persistent UI element — doesn't participate in it.
- **Nav wrapping at sm breakpoint**: The desktop nav shows at `sm:` (640px), but 7 items don't fit comfortably until ~1200px. Between 640–1150px, "Addiction Boards" and "Quick Practice" wrap to two lines. Even at 1024px (a standard laptop width), wrapping is visible.
- **Affects both app and marketing headers**: The marketing header (`components/marketing/marketing-layout.tsx`) and marketing footer have the same brand font issue.

## Broader Design Concerns (Documented, Not Addressed Here)

### Font system similarity

All three project fonts (Manrope, Instrument Sans, Plus Jakarta Sans) are geometric sans-serifs with similar proportions. Browser inspection confirms the perceptual differences are minimal — the fonts are effectively doing the work of one font at different weights/sizes while incurring the load cost of three font files. Font pairing best practices recommend mixing categories (e.g., sans + serif) for clear contrast. The current system works because each font occupies a distinct context (body vs. headings vs. numbers), but the hierarchy is subtle. A future overhaul should consider replacing one font (likely Instrument Sans, which is least distinguishable from Manrope) with a serif or more characterful typeface.

### App-side H2s missing `font-heading`

Section headings on app pages ("Ready to practice?", "Recent sessions", "Recent activity" on Dashboard) are plain `text-sm font-medium` Manrope with no `font-heading`. Meanwhile, the landing page H2s ("Everything you need to prep efficiently", "Simple pricing") correctly use `font-heading` (Instrument Sans) at `text-3xl font-bold tracking-tight`. This inconsistency means the font system is applied to marketing but not to the app interior. Fixing this touches many files across multiple pages and warrants a separate ticket.

### Other typography observations (from browser audit)

- **Active nav link differentiation is weak**: only a weight bump (400→500) + color change, no underline/background/border indicator
- **No letter-spacing anywhere in Manrope text**: small labels and badges could benefit from slight positive tracking
- **Stat number letter-spacing**: `font-display` numbers at large sizes would benefit from `tracking-tight`
- **Subtitle gap**: only 4px between page H1 and description text; 8–12px would improve readability
- **Bookmark card titles**: use plain Manrope at same size/weight as labels, should arguably use `font-heading`

These are all valid observations for future polish passes but out of scope for this stopgap.

## Affected Files

| File | Issue |
|------|-------|
| `app/(app)/app/layout.tsx:80` | Brand link: `text-sm font-semibold` in Manrope, no `font-heading` |
| `components/app-desktop-nav.tsx:19` | Desktop nav: `sm:flex` breakpoint too low; no `whitespace-nowrap` |
| `components/mobile-nav.tsx:106` | Mobile nav: `sm:hidden` breakpoint too low |
| `components/marketing/marketing-layout.tsx:18,28` | Marketing brand link: same plain Manrope issue |
| `components/marketing/marketing-layout.tsx:71` | Footer brand text: no `font-heading` |

## Root Cause

The header was built before the `font-heading` / `font-display` system was established and was never updated to use it. The `sm:` breakpoint (640px) was chosen as a generic mobile/desktop split but doesn't account for the actual content width of 7 nav items plus brand text. Browser inspection confirmed the brand "Addiction Boards" renders at Manrope 14px/600 — only 100 weight units different from the active nav link (Manrope 14px/500). It reads as "just another nav link that happens to be first" rather than an app identity.

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

### 2. Desktop nav breakpoint: `sm:` → `lg:`

**Before:**
```tsx
className="hidden items-center gap-4 text-sm sm:flex"
```

**After:**
```tsx
className="hidden items-center gap-4 text-sm lg:flex"
```

Browser audit confirmed wrapping persists up to ~1150px. `md:` (768px) is insufficient — items would still be extremely cramped. `lg:` (1024px) gives enough room for all 7 items with `whitespace-nowrap`. Below 1024px, show the hamburger menu.

### 3. Mobile nav breakpoint: `sm:hidden` → `lg:hidden`

Mirror the desktop breakpoint change so the hamburger menu shows below `lg:`.

### 4. Nav links: Add `whitespace-nowrap`

Prevent "Quick Practice" from wrapping at any viewport width where the desktop nav is visible.

### 5. Marketing header + footer: Same brand treatment

Apply `font-heading font-bold text-base whitespace-nowrap` to the marketing header brand link and footer brand text for consistency.

## What This Does NOT Fix

- Does not change the 3-font system (Manrope / Instrument Sans / Plus Jakarta Sans)
- Does not add `font-heading` to nav links (research confirms body font is correct for nav readability)
- Does not touch page headings, stats, or pricing — those are already correct
- Does not address the broader font-similarity concern (documented above for future consideration)
