# DEBT-108: Hardcoded Zinc Colors Break Light/Dark Mode Toggle

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05

---

## Description

When orange CTA colors were replaced during the achromatic UI redesign, the replacements used **hardcoded Tailwind color classes** (`bg-zinc-100 text-zinc-900`) instead of **semantic design tokens** (`bg-primary text-primary-foreground` or `bg-secondary text-secondary-foreground`).

These hardcoded values look correct in light mode but are visually broken in dark mode — light gray background with dark text on a dark page creates an unreadable washed-out button.

## Affected Files

### BROKEN (visually wrong in dark mode)

| File | Lines | Class | Problem |
|------|-------|-------|---------|
| `components/get-started-cta.tsx` | 34, 47, 64 | `bg-zinc-100 text-zinc-900` | 3 CTA button instances — unreadable in dark mode |
| `components/auth-nav.tsx` | 49 | `bg-zinc-100 text-zinc-900` | Sign In button — unreadable in dark mode |
| `app/pricing/pricing-view.tsx` | 19, 90 | `bg-zinc-100 text-zinc-900` | DefaultButton + "Go to Dashboard" — unreadable in dark mode |
| `app/pricing/pricing-client.tsx` | 17 | `bg-zinc-100 text-zinc-900` | SubscribeButton — unreadable in dark mode |
| `app/pricing/pricing-view.tsx` | 129 | `border-2 border-zinc-500` | Annual plan highlight border — barely visible in dark mode (~2.3:1 contrast) |

### RISKY (may look bad, needs visual verification)

| File | Lines | Class | Problem |
|------|-------|-------|---------|
| `app/(app)/app/dashboard/page.tsx` | 26, 33, 40, 47, 56 | `hover:border-zinc-700/50 hover:bg-zinc-900/80` | Dashboard stat card hover — dark overlay makes text unreadable in light mode |
| `components/theme-toggle.tsx` | 23 | `hover:bg-gray-100` + `dark:hover:bg-[#1F1F23]` | Weak hover feedback in dark mode; hardcoded hex |
| `components/providers.tsx` | 14-17 | Hardcoded hex colors | Clerk appearance locked to dark theme, no light mode variant |

### OK (properly scoped)

| File | Lines | Pattern | Why OK |
|------|-------|---------|--------|
| `components/question/ChoiceButton.tsx` | 31-55 | `dark:bg-emerald-950/20` | Has explicit `dark:` variants |
| `components/question/Feedback.tsx` | 16-19 | `dark:border-emerald-900/50` | Has explicit `dark:` variants |
| `components/marketing/marketing-home.tsx` | 232 | `border-primary` | Uses semantic token |

## Impact

- Primary CTA buttons ("Get Started", "Sign In", "Subscribe") are **unreadable in dark mode**
- The app is dark-mode-first, so this affects the majority user experience
- Annual pricing highlight border is nearly invisible in dark mode
- Dashboard card hover states are broken in light mode

## Resolution

Replace hardcoded zinc classes with semantic design tokens:

```tsx
// Before (broken):
className="bg-zinc-100 text-zinc-900 hover:bg-white"

// After (theme-aware):
className="bg-primary text-primary-foreground hover:bg-primary/90"
// or
className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
```

For the annual plan border, replace `border-zinc-500` with `border-primary` or a `MetallicBorder` wrapper.

For dashboard hover states, use semantic tokens:
```tsx
// Before:
hover:border-zinc-700/50 hover:bg-zinc-900/80

// After:
hover:border-border hover:bg-muted/50
```

## Verification

1. Toggle between light and dark mode on all affected pages
2. Verify CTA buttons are readable in both modes (WCAG AA: 4.5:1 contrast minimum)
3. Verify annual plan card border is visible in dark mode
4. Verify dashboard card hover states don't obscure text
5. Consider adding a dark-mode contrast E2E test (`marketing-contrast-dark.spec.ts`)

## Related

- DEBT-097: V0 Premium Landing Page Components (originated the zinc replacements)
- DEBT-098: Clerk UI Components Not Fully Themed
- `tests/e2e/marketing-contrast.spec.ts` — existing light-mode contrast test (no dark-mode equivalent yet)
