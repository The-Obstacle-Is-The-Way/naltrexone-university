# DEBT-261: Touch Targets

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** TOUCH-1, TOUCH-2
**Blocked by:** Decision 11 (Mobile Touch Target Strategy)
**Files:** `components/mobile-nav.tsx`, `components/theme-toggle.tsx`, `components/auth-nav.tsx`

---

## Items

### TOUCH-1: Systemic Button Touch Targets Below WCAG AAA

**Severity:** Medium (WCAG AA compliant, fails AAA / Apple HIG)

Default Button `h-9` (36px) and icon `size-9` (36px) are below 44px AAA target. Affects virtually every button.

### TOUCH-2: Clerk UserButton Touch Target

**Severity:** Medium-High (smallest interactive element in header)

Clerk's `<UserButton />` renders at ~28–33px. Below WCAG AA would be 24px — it passes AA but is significantly below AAA.

---

## Decision Dependency

**Decision 11** must resolve:
- **Option A:** Increase Button default to `h-11 sm:h-9` (44px mobile, 36px desktop). Most thorough but alters entire app.
- **Option B:** Leave as-is. Document as intentional WCAG AA compliance.
- **Option C (recommended):** Targeted fixes — hamburger (`p-2` → `p-2.5`), theme toggle wrapper padding, Clerk avatar wrapper/appearance prop. Leave `h-9` default unchanged.

---

## Verification

Inspect buttons at 375px viewport. Measure computed height of hamburger, theme toggle, and Clerk avatar.
