# DEBT-260: UX Seams

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** UX-1, UX-2, UX-3, UX-4
**Blocked by:** Decisions 3, 6, 7, 8
**Files:** `app/pricing/pricing-view.tsx`, `app/(app)/app/questions/[slug]/question-page-client.tsx`, `components/marketing/marketing-layout.tsx`, `components/providers.tsx`, and documentation updates in `docs/frontend/design-principles.md` / `docs/frontend/pattern-registry.md`

---

## Items

### UX-1: Pricing Subscribed-State Dead Space

**Blocked by:** Decision 6
**File:** `app/pricing/pricing-view.tsx:37`

**Current:**
```tsx
className="min-h-screen bg-background py-16"
```

`PricingView` is rendered inside `MarketingLayout` (`app/pricing/page.tsx:151`), and `MarketingLayout` already uses `min-h-[100dvh]` (`components/marketing/marketing-layout.tsx:22`).

**Recommended target:** Remove `min-h-screen` from pricing root.

### UX-2: Standalone Question Review Bookmark Gap

**Blocked by:** Decision 7

**Current:** `app/(app)/app/questions/[slug]/question-page-client.tsx:309-398` renders `data-testid="bottom-action-bar"` with Previous / Submit or Try Again / Next / Back actions only. No bookmark action is rendered in this action bar.

**Recommended:** No code change. `design-principles.md` §2 currently implies this via "History Individual Review | [Try Again] [Back to ...]" (no bookmark listed). Add explicit wording so this is documented intentionally, not implied by omission.

### UX-3: Marketing Shell Missing ThemeToggle

**Blocked by:** Decision 3
**File:** `components/marketing/marketing-layout.tsx:42`

**Current:** Header action area renders only `{authNav}`.
```tsx
<div className="flex items-center gap-2">{authNav}</div>
```

**Recommended:** Add `<ThemeToggle />` to marketing header for app/marketing shell parity.

### UX-4: Clerk Dark Mode Visual Seam

**Blocked by:** Decision 8

**Current:** Clerk appearance uses `borderRadius: '0.75rem'` in both dark/light themes (`components/providers.tsx:22`, `components/providers.tsx:33`), while major app surfaces use `rounded-2xl` (16px). This creates a subtle seam on auth surfaces.

**Recommended:** No code change. Accept as documented third-party trade-off and add/maintain note in Pattern Registry.

---

## Decision Dependencies

| Item | Decision | Recommended Outcome |
|------|----------|-------------------|
| UX-1 | Decision 6 | Remove `min-h-screen` |
| UX-2 | Decision 7 | No code change (docs only) |
| UX-3 | Decision 3 | Add `<ThemeToggle />` to marketing header |
| UX-4 | Decision 8 | No code change (docs only) |

**Note:** If Decisions 7 and 8 accept the recommended "no code change" outcomes, those items become documentation-only updates that fold into DEBT-264.

---

## Verification

```bash
# UX-1 current state check
rg -n 'min-h-screen bg-background py-16' app/pricing/pricing-view.tsx
# Expected: 1 match currently; 0 when Decision 6 applies recommended fix

# UX-2 current action bar marker and absence of bookmark action wiring
rg -n 'data-testid=\"bottom-action-bar\"' \
  'app/(app)/app/questions/[slug]/question-page-client.tsx'
# Expected: 1 match
rg -n 'onToggleBookmark|bookmarkStatus|Mark for review' \
  'app/(app)/app/questions/[slug]/question-page-client.tsx'
# Expected: 0 matches in standalone review action bar implementation

# UX-3 current missing ThemeToggle in marketing shell
rg -n 'ThemeToggle' components/marketing/marketing-layout.tsx
# Expected: 0 matches currently; >=2 (import + usage) if Decision 3 approves parity

# UX-4 current Clerk border radius seam
rg -n \"borderRadius: '0.75rem'\" components/providers.tsx
# Expected: 2 matches (dark + light appearance configs)
```
