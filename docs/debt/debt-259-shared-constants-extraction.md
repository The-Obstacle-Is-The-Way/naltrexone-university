# DEBT-259: Shared Constants Extraction

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-13, D-11
**Blocked by:** DEBT-252 and DEBT-253 merged (D-13 touches files modified by both)
**Files:** `lib/shared-styles.ts` (new), `app/pricing/pricing-view.tsx`, + 6 consumer files

---

## Items

### D-13: headerLinkButtonClasses Deduplication

The exact same class string appears in 6 files:
```
h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline
```

**Target:** Create `lib/shared-styles.ts` with `headerActionLinkClasses` constant. Replace all 6 local definitions/inline strings with imports.

**Files to update:**
1. `app/(app)/app/dashboard/page.tsx` — named const
2. `app/(app)/app/history/components/history-sessions-tab.tsx` — named const
3. `app/(app)/app/history/components/history-questions-tab.tsx` — named const
4. `app/(app)/app/practice/components/practice-view.tsx` — inline
5. `app/(app)/app/bookmarks/page.tsx` — inline
6. `app/(app)/app/practice/practice-page-client.tsx` — inline

### D-11: Pricing Page Raw Divs → Card Component

**File:** `app/pricing/pricing-view.tsx`

Replace 4 raw card-like `<div>` elements with `<Card>` component + layout overrides.

---

## Decision Dependencies

None — but sequenced after DEBT-252/253 to avoid merge conflicts on shared files.

---

## Verification

```bash
# Old name gone
rg -n 'headerLinkButtonClasses' app
# Expected: 0 matches

# New constant exists and has 6 consumers
rg -n 'headerActionLinkClasses' lib/shared-styles.ts app
# Expected: 1 definition + 6 import/usage matches

# No raw card divs in pricing
rg -n 'rounded-2xl border(?:-2)? border-(?:border|primary) bg-card p-8' \
  app/pricing/pricing-view.tsx
# Expected: 0 matches
```
