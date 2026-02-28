# DEBT-260: UX Seams

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** UX-1, UX-2, UX-3, UX-4
**Blocked by:** Decisions 3, 6, 7, 8
**Files:** 1–3 files depending on decisions

---

## Items

### UX-1: Pricing Subscribed-State Dead Space

**Blocked by:** Decision 6
**File:** `app/pricing/pricing-view.tsx:37`

Remove `min-h-screen` from pricing root. The outer `MarketingLayout` already uses `min-h-[100dvh]`.

### UX-2: Standalone Question Review Bookmark Gap

**Blocked by:** Decision 7

**Recommended:** No code change. Document in `design-principles.md` §2 that standalone review intentionally excludes bookmark.

### UX-3: Marketing Shell Missing ThemeToggle

**Blocked by:** Decision 3
**File:** `components/marketing/marketing-layout.tsx`

**Recommended:** Add `<ThemeToggle />` to marketing header.

### UX-4: Clerk Dark Mode Visual Seam

**Blocked by:** Decision 8

**Recommended:** No code change. Accept as documented trade-off. Add note to Pattern Registry.

---

## Decision Dependencies

| Item | Decision | Recommended Outcome |
|------|----------|-------------------|
| UX-1 | Decision 6 | Remove `min-h-screen` |
| UX-2 | Decision 7 | No code change (docs only) |
| UX-3 | Decision 3 | Add `<ThemeToggle />` to marketing header |
| UX-4 | Decision 8 | No code change (docs only) |

**Note:** If Decisions 7 and 8 accept the recommended "no code change" outcomes, those items become documentation-only updates that fold into DEBT-264.
