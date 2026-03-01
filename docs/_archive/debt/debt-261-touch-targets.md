# DEBT-261: Touch Targets

**Status:** Resolved (2026-03-01)
**Parent:** [DEBT-250](../../debt/debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** TOUCH-1, TOUCH-2
**Decision 11:** Resolved — Option C (targeted fixes)
**Resolution:** Implemented in PR #152 (2026-03-01)
**Files:** `components/mobile-nav.tsx`, `components/theme-toggle.tsx`, `components/auth-nav.tsx` (and possibly `components/providers.tsx` for Clerk avatar wrapper)

---

## Items

### TOUCH-1: Systemic Button Touch Targets Below WCAG AAA

**Severity:** Medium (WCAG AA compliant, fails AAA / Apple HIG)

Default Button `h-9` (36px) and icon `size-9` (36px) are below 44px AAA target. Affects virtually every button.

**Current evidence:**
- `components/ui/button.tsx:27` → `size.default: 'h-9 ...'`
- `components/ui/button.tsx:30` → `size.icon: 'size-9'`
- `components/mobile-nav.tsx:111` → hamburger button `className="p-2 ..."` with `size-6` icon (40x40 rendered)
- `components/theme-toggle.tsx:24` → `size="icon"` (maps to `size-9`)
- `components/auth-nav.tsx:45` → unauthenticated CTA uses `size="sm"` (`h-8` = 32px)

### TOUCH-2: Clerk UserButton Touch Target

**Severity:** Medium-High (smallest interactive element in header)

Clerk's `<UserButton />` renders at ~28–33px. Below WCAG AA would be 24px — it passes AA but is significantly below AAA.

**Current evidence:**
- `components/auth-nav.tsx:83`:
```tsx
<UserButton />
```

---

## Decision Dependency — Resolved

**Decision 11** resolved as **Option C: Targeted fixes.**

Leave `h-9` system default unchanged (36px passes WCAG AA). Fix the worst offenders in the header:
- **Hamburger button:** `p-2` → `p-2.5` (40px → 44px)
- **Theme toggle:** add touch-target wrapper or padding for 44px hit area on mobile
- **Clerk UserButton:** appearance prop or wrapper div for minimum 44px hit area
- **Auth CTA:** remove `size="sm"` (`h-8` = 32px outlier) and use default button sizing for the unauthenticated header CTA

---

## Verification

```bash
# System default UNCHANGED (Option C leaves these alone)
rg -n "default: 'h-9|icon: 'size-9" components/ui/button.tsx
# Expected: 2 matches (unchanged)

# TOUCH-1: Hamburger padding bumped
rg -n 'className="p-2\.5 .*hover:text-foreground' components/mobile-nav.tsx
# Expected: 1 match (was p-2, now p-2.5)

# TOUCH-1: ThemeToggle touch target increased
rg -n 'min-h-\[44px\]|min-h-11|p-2\.5' components/theme-toggle.tsx
# Expected: >=1 match (implementation varies — wrapper or padding)

# TOUCH-2: Clerk UserButton wrapper or appearance sizing
rg -n 'min-h-\[44px\]|min-w-\[44px\]|\[&_\.cl-userButtonTrigger\]|\[&_\.cl-userButtonBox\]' \
  components/auth-nav.tsx components/providers.tsx
# Expected: >=1 match (implementation varies)

# TOUCH-1: Auth CTA no longer undersized
rg -n 'size="sm"' components/auth-nav.tsx
# Expected: 0 matches (promoted to default size or touch-target wrapped)
```

Visual verification (required): inspect at 375px viewport and measure computed hit area for hamburger, theme toggle, and Clerk avatar trigger. All should be >=44px.
Auth CTA should no longer render at 32px height.
