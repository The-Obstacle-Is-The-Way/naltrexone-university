# BUG-227: Header Brand Uses Body Font; App Nav Wraps Immediately Above `sm`

**Status:** Open
**Priority:** P3
**Date:** 2026-03-16

## Summary

The app header brand text ("Addiction Boards") renders in plain Manrope (body font) at `text-sm font-semibold`, while app page H1s use `font-heading` (Instrument Sans) and prominent numeric stats use `font-display` (Plus Jakarta Sans). This creates a visual disconnect where the persistent brand mark feels weaker than the surrounding UI.

Separately, the app desktop nav appears at `sm` (`640px`), but there is a narrow range immediately above that breakpoint where the brand and "Quick Practice" wrap to two lines with left-aligned breaks. Browser inspection measured the current app-header wrap window at roughly `640px` through `727px`; by `728px`, the current header fits on one line again. The marketing header shares the brand-font issue, but it does not share the breakpoint problem.

## Impact

- **Brand feels weak**: "Addiction Boards" in the app header uses the same font family as nav links and differs from the active nav item by only one font-weight step (`600` vs. `500`). It reads more like another nav item than a brand mark.
- **Font system gap**: The codebase has an established 3-font system (`font-heading` for headings, `font-display` for prominent numbers, Manrope for body), but the header brand does not participate in it.
- **App nav wraps just above `sm`**: The current app desktop nav visibly breaks between `640px` and `727px`. This is a real bug, but it is narrower than originally estimated.
- **Marketing header/footer share only the brand-font issue**: The marketing header brand and footer brand also use plain Manrope, but the marketing header nav itself fits comfortably at `sm`.

## Broader Design Concerns (Documented, Not Addressed Here)

### Font system similarity

Manrope and Instrument Sans are perceptually close at the sizes and weights used for nav text and page headings, so the app-header brand does not gain much hierarchy from weight alone. Plus Jakarta Sans is more visibly distinct on large numeric stats and pricing. The current 3-font system still creates some hierarchy, but the contrast between body and heading fonts is subtler than ideal. A future overhaul could still consider a more characterful heading face or a serif pairing.

### App-side H2s missing `font-heading`

Section headings on app pages ("Ready to practice?", "Recent sessions", "Recent activity" on Dashboard) are plain `text-sm font-medium` Manrope with no `font-heading`. Meanwhile, the landing page H2s ("Everything you need to prep efficiently", "Simple pricing") correctly use `font-heading` (Instrument Sans) at `text-3xl font-bold tracking-tight`. This inconsistency means the font system is applied to marketing but not to the app interior. Fixing this touches many files across multiple pages and warrants a separate ticket.

### Other typography observations (from browser audit)

- **Active nav link differentiation is weak**: only a weight bump (400→500) + color change, no underline/background/border indicator
- **No letter-spacing anywhere in Manrope text**: small labels and badges could benefit from slight positive tracking
- **Stat number letter-spacing**: `font-display` numbers at large sizes would benefit from `tracking-tight`
- **Subtitle gap**: only 4px between page H1 and description text; 8–12px would improve readability
- **Bookmark card titles**: use plain Manrope at same size/weight as labels, should arguably use `font-heading`

These are valid observations for future polish passes but are out of scope for this bug.

## Affected Files

| File | Issue |
|------|-------|
| `app/(app)/app/layout.tsx:80` | Brand link: `text-sm font-semibold` in Manrope, no `font-heading` |
| `components/app-desktop-nav.tsx:19` | App desktop nav appears at `sm:flex`; desktop links do not use `whitespace-nowrap` |
| `components/mobile-nav.tsx:106` | App mobile nav hides at `sm:hidden`; this must mirror any desktop-breakpoint change |
| `components/marketing/marketing-layout.tsx:18,28` | Marketing header brand link uses the same plain Manrope treatment as the app header |
| `components/marketing/marketing-layout.tsx:71` | Marketing footer brand text uses plain Manrope (`16px / 600`), not `font-heading` |

## Root Cause

The header was built before the `font-heading` / `font-display` system was established and was never updated to use it. Browser inspection confirmed the app brand "Addiction Boards" renders at `Manrope 14px / 600`, only `100` weight units heavier than the active nav link (`Manrope 14px / 500`), so it reads as "another nav link that happens to be first" rather than a brand mark.

The app nav breakpoint was also chosen as a generic `sm:` mobile/desktop split rather than from measured content width. The current app header fits again by roughly `728px`. After simulating the proposed stronger brand (`font-heading text-base font-bold whitespace-nowrap`) plus `whitespace-nowrap` on desktop nav links, the app header fit point moved to roughly `744px`, which means `md` (`768px`) is sufficient to eliminate wrapping. `lg` (`1024px`) is therefore an optional, more conservative product choice rather than a layout requirement.

The marketing header has only three left-side items (brand + Features + Pricing) and still had ample spare space at `640px`, both before and after simulating the stronger brand. It does not need a breakpoint bump to fix wrapping.

## Browser-Verified Findings

- **App header brand:** `Manrope 14px / 600`
- **Active app nav link:** `Manrope 14px / 500`
- **`font-heading`:** resolves to Instrument Sans and renders on app H1s (`Dashboard`, `Practice`, `History`, `Bookmarks`) at `24px / 700`
- **`font-display`:** resolves to Plus Jakarta Sans and renders on dashboard stat numbers at `30px / 700`
- **Marketing header brand:** `Manrope 14px / 600`
- **Marketing footer brand:** `Manrope 16px / 600`
- **Current app-header wrap window:** roughly `640px` through `727px`
- **Current app-header fit point:** about `728px`
- **Simulated app-header fit point after stronger brand + `whitespace-nowrap`:** about `744px`
- **At `768px` with the simulated stronger brand:** app header still had roughly `24px` of space between the left nav group and right control group
- **At `1024px` with the simulated stronger brand:** app header had hundreds of pixels of spare space; it was not close to wrapping
- **Marketing header at `640px` with the simulated stronger brand:** still had roughly `144px` of spare space locally, so the existing `sm:` breakpoint remains acceptable

## Stopgap Fix

These changes fix the measured issues without redesigning the full typography system:

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

### 2. App desktop nav breakpoint: raise `sm:` to at least `md:`

**Before:**
```tsx
className="hidden items-center gap-4 text-sm sm:flex"
```

**After:**
```tsx
className="hidden items-center gap-4 text-sm md:flex"
```

Browser measurement showed:

- current app header fits again by about `728px`
- simulated stronger brand + `whitespace-nowrap` fit by about `744px`
- `md` (`768px`) therefore clears the wrap threshold with a small but real buffer

If product direction prefers an earlier hamburger menu and more breathing room, `lg` is still acceptable, but it should be documented as an intentionally conservative UX choice rather than as the minimum width required to avoid wrapping.

### 3. App mobile nav breakpoint: mirror the chosen desktop breakpoint

If desktop moves from `sm:flex` to `md:flex`, mobile should move from `sm:hidden` to `md:hidden`. If product intentionally chooses `lg` instead, mobile should mirror `lg`.

### 4. App desktop nav links: Add `whitespace-nowrap`

Prevent "Quick Practice" from wrapping at any viewport width where the desktop nav is visible. The other nav labels are single tokens and do not currently wrap on their own, but applying the utility uniformly keeps the rule simple.

### 5. Marketing header + footer: apply the same brand treatment, but keep the current nav breakpoints

Apply `font-heading font-bold text-base` to the marketing header brand link and marketing footer brand text for consistency. Keep `whitespace-nowrap` on the header brand; it is optional in the footer. Leave the marketing header nav at `sm:flex` / `sm:hidden`, because the three-item marketing nav already fits comfortably at `640px`.

## What This Does NOT Fix

- Does not change the 3-font system (Manrope / Instrument Sans / Plus Jakarta Sans)
- Does not add `font-heading` to nav links (research confirms body font is correct for nav readability)
- Does not change the marketing header breakpoint — current `sm:` behavior is already acceptable there
- Does not touch page headings, stats, or pricing — the spot-checked pages already render those with the intended fonts
- Does not address the broader font-similarity concern (documented above for future consideration)
