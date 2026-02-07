# DEBT-150: Navigation Links Missing Transitions and Hover States

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

Text-based navigation links often change color on hover but omit `transition-colors`, causing abrupt state changes and inconsistent polish across the app. Some links include hover text color only, while others include hover background + text, but the transition behavior is not standardized.

## Instances Found

### Missing `transition-colors` (sample, not exhaustive)

| File | Line(s) | Element | Current Hover | Issue |
|------|---------|---------|---------------|-------|
| `components/app-desktop-nav.tsx` | 36-38 | Inactive nav links | `hover:text-foreground` | No bg change, no transition |
| `components/auth-nav.tsx` | 42-46, 80-84 | Auth nav links | `hover:text-foreground` | No bg change, no transition |
| `app/(app)/app/bookmarks/page.tsx` | 93, 202 | "Go to Practice" links | `hover:text-foreground` | No transition |
| `app/(app)/app/practice/components/practice-view.tsx` | 77 | "Back to Dashboard" link | `hover:text-foreground` | No transition |
| `app/(app)/app/review/page.tsx` | 69, 86, 176, 187 | Review navigation links | `hover:text-foreground` | No transition |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | 54 | "Back to Practice" link | `hover:text-foreground` | No transition |

### Existing hover-bg pattern (can be standardized with transitions)

| File | Line(s) | Element | Classes |
|------|---------|---------|---------|
| `components/mobile-nav.tsx` | 73 | Mobile nav links | `hover:bg-muted hover:text-foreground` (no transition yet) |

## Impact

- Color changes on hover feel abrupt without `transition-colors` (instant snap vs smooth 150ms fade)
- Inconsistent hover patterns across desktop nav vs mobile nav — some links include bg hover while others are text-only
- Missing transitions make interactive links feel less responsive compared to buttons that already animate
- Minor polish issue but noticeable when comparing to the rest of the UI which transitions smoothly

## Resolution

1. Added `transition-colors` to app/marketing/auth/nav utility links, including:
   - `components/app-desktop-nav.tsx`
   - `components/auth-nav.tsx`
   - `components/mobile-nav.tsx`
   - `components/marketing/marketing-home.tsx`
   - `app/pricing/pricing-view.tsx`
   - `app/(app)/app/bookmarks/page.tsx`
   - `app/(app)/app/review/page.tsx`
   - `app/(app)/app/practice/components/practice-view.tsx`
   - `app/(app)/app/questions/[slug]/question-page-client.tsx`
2. Standardized text-link hover behavior to `text-muted-foreground transition-colors hover:text-foreground`.
3. Added regression coverage:
   - `components/app-desktop-nav.test.tsx`
   - `components/auth-nav.test.tsx`
   - `components/mobile-nav.test.tsx`
   - `components/marketing/marketing-home.test.tsx`
   - `app/pricing/page.test.tsx`
   - `app/(app)/app/bookmarks/page.test.tsx`
   - `app/(app)/app/review/page.test.tsx`
   - `app/(app)/app/practice/components/practice-view.test.tsx`
   - `app/(app)/app/questions/[slug]/question-page-client.test.tsx`

Recommended standard for text links in the app:

```tsx
className="text-muted-foreground transition-colors hover:text-foreground"
```

## Verification

- [x] All nav links in `app-desktop-nav.tsx` and `auth-nav.tsx` have `transition-colors`
- [x] "Go to Practice" link in bookmarks has `transition-colors`
- [x] "Back to Dashboard" link in practice view has smooth transition on hover
- [x] Visual check: hover transitions feel smooth and consistent across all nav elements

## Related

- DEBT-148: Minimal ARIA accessibility — same UI polish category
- DEBT-144 (archived): Hardcoded colors bypass design system — design consistency
