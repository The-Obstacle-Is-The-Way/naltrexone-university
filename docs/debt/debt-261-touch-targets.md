# DEBT-261: Touch Targets

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** TOUCH-1, TOUCH-2
**Blocked by:** Decision 11 (Mobile Touch Target Strategy)
**Files:** `components/mobile-nav.tsx`, `components/theme-toggle.tsx`, `components/auth-nav.tsx`, and (Option A only) `components/ui/button.tsx` (Option C alternative may also touch `components/providers.tsx`)

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

## Decision Dependency

**Decision 11** must resolve:
- **Option A:** Increase Button default to `h-11 sm:h-9` (44px mobile, 36px desktop). Most thorough but alters entire app.
- **Option B:** Leave as-is. Document as intentional WCAG AA compliance.
- **Option C (recommended):** Targeted fixes — hamburger (`p-2` → `p-2.5`), theme toggle wrapper padding, auth fallback CTA sizing in `auth-nav.tsx`, and Clerk avatar wrapper/appearance prop. Leave `h-9` default unchanged.

---

## Verification

```bash
# Baseline: current systemic sizes
rg -n \"default: 'h-9|icon: 'size-9\" components/ui/button.tsx
# Expected: 2 matches currently

# Baseline: current mobile-nav hamburger sizing
rg -n 'className=\"p-2 .*hover:text-foreground' components/mobile-nav.tsx
# Expected: 1 match currently

# Baseline: ThemeToggle uses icon button size variant
rg -n 'size=\"icon\"' components/theme-toggle.tsx
# Expected: 1 match currently

# Baseline: Clerk UserButton remains default-sized
rg -n '<UserButton />' components/auth-nav.tsx
# Expected: 1 match currently

# Baseline: unauthenticated auth-nav CTA uses small size
rg -n 'size=\"sm\"' components/auth-nav.tsx
# Expected: 1 match currently

# Option A verification (if selected): default and icon sizes changed for mobile
rg -n \"default: 'h-11 sm:h-9|icon: 'size-11 sm:size-9\" components/ui/button.tsx
# Expected: 2 matches when Option A is implemented

# Option C verification (if selected): targeted hamburger bump
rg -n 'className=\"p-2\\.5 .*hover:text-foreground' components/mobile-nav.tsx
# Expected: 1 match when Option C is implemented

# Option C verification (if selected): either theme-toggle or clerk wrapper sizing added
rg -n 'size-11|\\[&_\\.cl-userButtonTrigger\\]:size-11|\\[&_\\.cl-userButtonBox\\]:size-11' \
  components/theme-toggle.tsx components/auth-nav.tsx components/providers.tsx
# Expected: >=1 match when Option C is implemented (implementation choice varies)
```

Visual verification (required): inspect at 375px viewport and measure computed hit area for hamburger, theme toggle, and Clerk avatar trigger.
