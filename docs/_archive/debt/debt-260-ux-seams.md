# DEBT-260: UX Seams

**Status:** Resolved (2026-03-01)
**Parent:** [DEBT-250](../../debt/debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** UX-1, UX-2, UX-3, UX-4
**Resolution:** Implemented in PR #152 (2026-03-01)
**Files:** `app/pricing/pricing-view.tsx`, `components/marketing/marketing-layout.tsx`, and documentation updates in `docs/frontend/design-principles.md` / `docs/frontend/pattern-registry.md`

---

## Items

### UX-1: Pricing Subscribed-State Dead Space

**Decision 6:** Resolved — remove `min-h-screen`
**File:** `app/pricing/pricing-view.tsx:37`

**Current:**
```tsx
className="min-h-screen bg-background py-16"
```

`PricingView` is rendered inside `MarketingLayout` (`app/pricing/page.tsx:151`), and `MarketingLayout` already uses `min-h-[100dvh]` (`components/marketing/marketing-layout.tsx:22`).

**Recommended target:** Remove `min-h-screen` from pricing root.

### UX-2: Standalone Question Review Bookmark Gap

**Decision 7:** Resolved — no code change, document explicitly

**Current:** `app/(app)/app/questions/[slug]/question-page-client.tsx:309-398` renders `data-testid="bottom-action-bar"` with Previous / Submit or Try Again / Next / Back actions only. No bookmark action is rendered in this action bar.

**Recommended:** No code change. `design-principles.md` §2 currently implies this via "History Individual Review | [Try Again] [Back to ...]" (no bookmark listed). Add explicit wording so this is documented intentionally, not implied by omission.

### UX-3: Marketing Shell Missing ThemeToggle

**Decision 3:** Resolved — add `<ThemeToggle />`
**File:** `components/marketing/marketing-layout.tsx:42`

**Current:** Header action area renders only `{authNav}`.
```tsx
<div className="flex items-center gap-2">{authNav}</div>
```

**Recommended:** Add `<ThemeToggle />` to marketing header for app/marketing shell parity.

### UX-4: Clerk Dark Mode Visual Seam

**Decision 8:** Resolved — accept and document as third-party trade-off

**Current:** Clerk appearance uses `borderRadius: '0.75rem'` in both dark/light themes (`components/providers.tsx:22`, `components/providers.tsx:33`), while major app surfaces use `rounded-2xl` (16px). This creates a subtle seam on auth surfaces. Interaction states also differ from app button/link conventions because Clerk controls are third-party-rendered and not using local `Button`/link class systems.

**Recommended:** No code change. Accept as documented third-party trade-off and add/maintain note in Pattern Registry.

---

## Decision Dependencies — All Resolved

| Item | Decision | Resolution |
|------|----------|-----------|
| UX-1 | ~~Decision 6~~ Resolved | Remove `min-h-screen` from pricing root |
| UX-2 | ~~Decision 7~~ Resolved | No code change — document explicitly in `design-principles.md` §2 |
| UX-3 | ~~Decision 3~~ Resolved | Add `<ThemeToggle />` to marketing header |
| UX-4 | ~~Decision 8~~ Resolved | No code change — accept and document Clerk seam in Pattern Registry |

**Implementation scope:** UX-1 and UX-3 are code changes. UX-2 and UX-4 are documentation-only — their doc updates can fold into DEBT-264 or ship with this spec.

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
