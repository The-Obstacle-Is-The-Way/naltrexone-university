# DEBT-253: Scattered Phase 1 Fixes

**Status:** Not started
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-2, D-4, D-7, D-12
**Files:** 4 independent files (no collision risk — can be done in any order)

---

## Items

### D-2: History Questions Row Hover Token

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`
**Pattern:** I-2 (Hoverable Card Row, standalone) — standalone rows on page background use `/50`

**Current** (`history-questions-tab.tsx:464`):
```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target:**
```
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Change:** `hover:bg-accent/40` → `hover:bg-muted/50`

### D-4: Filter Chip Hover Opacity

**File:** `components/ui/filter-chip.tsx`
**Pattern:** I-4 (Filter Chip) — standard interactive hover

**Current** (`filter-chip.tsx:28`):
```
border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground
```

**Target:**
```
border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-accent-foreground
```

**Change:** `hover:bg-accent` (100%!) → `hover:bg-muted/50`

### D-7: Review Navigator Ring Style

**File:** `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`
**Pattern:** X-2 (Focus Ring — `ring-[3px] ring-ring/50`)

**Current** (`review-question-navigator.tsx:58`):
```tsx
isCurrent && 'ring-2 ring-ring',
```

**Target:**
```tsx
isCurrent && 'ring-[3px] ring-ring/50',
```

**Changes:**
1. `ring-2` → `ring-[3px]` (standard width)
2. `ring-ring` → `ring-ring/50` (standard opacity)

### D-12: Pricing Dismiss Hover Strategy

**File:** `app/pricing/pricing-view.tsx`
**Pattern:** Link hover must use text-color or bg-color, never `opacity`

**Current** (`pricing-view.tsx:75`):
```
ml-4 rounded-md text-current hover:opacity-70 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target:**
```
ml-4 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `text-current hover:opacity-70` → `text-muted-foreground transition-colors hover:text-foreground` (text-color hover pattern; no opacity-based hover)
2. Add `transition-colors` (X-3 rule — every hover needs a transition)

---

## TDD Approach

1. **D-2 test:** Render a history question row. Assert `hover:bg-muted/50` present, `hover:bg-accent/40` absent.
2. **D-4 test:** Render unselected `FilterChip`. Assert `hover:bg-muted/50` present, `hover:bg-accent` absent.
3. **D-7 test:** Render `ReviewQuestionNavigator` with a current question. Assert current button has `ring-[3px] ring-ring/50` (not `ring-2 ring-ring`).
4. **D-12 test:** Render `PricingView` with a banner. Assert dismiss link has `hover:text-foreground` (not `hover:opacity-70`).

**Test files:**
1. Existing: `app/(app)/app/history/components/history-questions-tab.test.tsx` (update hover class expectation for D-2)
2. Existing: `components/ui/filter-chip.test.tsx` (update unselected hover class expectation for D-4)
3. Existing: `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx` (update ring expectation for D-7)
4. Existing: `app/pricing/page.test.tsx` (add D-12 assertion on rendered `PricingView` dismiss-link classes: text-color hover present, opacity hover absent)

All use `renderToStaticMarkup` + jsdom.

---

## Verification

```bash
# D-2: No accent hover in history questions
rg -n 'hover:bg-accent' \
  'app/(app)/app/history/components/history-questions-tab.tsx'
# Expected: 0 matches

# D-4: No accent hover in filter chip (unselected path)
rg -n 'hover:bg-accent' components/ui/filter-chip.tsx
# Expected: 0 matches

# D-7: No ring-2 ring-ring without /50
rg -n 'ring-2 ring-ring' \
  'app/(app)/app/questions/[slug]/components/review-question-navigator.tsx'
# Expected: 0 matches

# D-12: No opacity hover in pricing
rg -n 'text-current hover:opacity-70' app/pricing/pricing-view.tsx
# Expected: 0 matches
```

---

## Visual QA

1. **History questions:** Hover a question row → subtle `muted/50` background shift
2. **Filter chips:** Hover an unselected chip → matches other hover patterns in intensity
3. **Review navigator:** Current question pill → ring is slightly softer (`/50` opacity)
4. **Pricing banner:** Hover dismiss "×" → text dims/brightens, no opacity flash
