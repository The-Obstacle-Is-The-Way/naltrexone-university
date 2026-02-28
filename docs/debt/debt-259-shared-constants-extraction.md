# DEBT-259: Shared Constants Extraction

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-13, D-11
**Blocked by:** DEBT-252 and DEBT-253 merged (D-13 touches files modified by both)
**Files:** `lib/shared-styles.ts` (new), `app/pricing/pricing-view.tsx`, and 6 app consumers for `headerActionLinkClasses`

---

## Items

### D-13: headerLinkButtonClasses Deduplication

**Severity:** Low (code health)

The exact same class string appears in 6 files:
```
h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline
```

**Current locations:**
1. `app/(app)/app/dashboard/page.tsx:33-34` (`const headerLinkButtonClasses = ...`)
2. `app/(app)/app/history/components/history-sessions-tab.tsx:24-25` (`const headerLinkButtonClasses = ...`)
3. `app/(app)/app/history/components/history-questions-tab.tsx:35-36` (`const headerLinkButtonClasses = ...`)
4. `app/(app)/app/practice/components/practice-view.tsx:156` (inline `className`)
5. `app/(app)/app/bookmarks/page.tsx:56` (inline `className`)
6. `app/(app)/app/practice/practice-page-client.tsx:35` (inline `className`)

**Target:** Create `lib/shared-styles.ts` with `headerActionLinkClasses` constant. Replace all 6 local definitions/inline strings with imports.

**Target constant:**
```ts
/** Header action links ("View all", "Clear filters") — Pattern Registry L-3 */
export const headerActionLinkClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';
```

**Implementation note:** Pattern Registry Part 10 extraction rule is `3+` files. This item qualifies with 6 files.
**Implementation note:** This class string omits `transition-colors` intentionally because all current consumers use `<Button variant="link">`, and `button.tsx` base classes already provide `transition-colors`. If this constant is ever used outside `Button`, add `transition-colors` explicitly to satisfy Standards §14 and Pattern Registry X-3.

### D-11: Pricing Page Raw Divs → Card Component

**Severity:** Low
**File:** `app/pricing/pricing-view.tsx` (4 raw card-like divs)

**Current locations:**
1. `app/pricing/pricing-view.tsx:85` (entitled-state card)
2. `app/pricing/pricing-view.tsx:102` (needs-attention card)
3. `app/pricing/pricing-view.tsx:126` (monthly plan card)
4. `app/pricing/pricing-view.tsx:151` (annual plan card)

Replace those 4 raw `<div>` card shells with `<Card>` + layout overrides.

**Target sketch:**
```tsx
// Lines 85 and 102:
<Card className="mx-auto mt-16 max-w-2xl p-8 text-center">

// Line 126:
<Card className="p-8">

// Line 151:
<Card className="border-2 border-primary p-8">
```

`Card` already provides `rounded-2xl border bg-card text-card-foreground shadow-sm`.
`Card` also adds `gap-0` by default; verify no spacing regression in these pricing cards.

---

## Decision Dependencies

None — but sequenced after DEBT-252/253 to avoid merge conflicts on shared files.

---

## Verification

```bash
# Old name gone
rg -n 'headerLinkButtonClasses' app
# Expected: 0 matches

# New constant defined once
rg -n 'export const headerActionLinkClasses' lib/shared-styles.ts
# Expected: 1 match

# New constant consumed in 6 app files
rg -n 'headerActionLinkClasses' app | cut -d: -f1 | sort -u | wc -l
# Expected: 6

# No raw card divs in pricing
rg -n 'rounded-2xl border(?:-2)? border-(?:border|primary) bg-card p-8' \
  app/pricing/pricing-view.tsx
# Expected: 0 matches

# Pricing now uses Card component in all four former raw-card locations
rg -n '<Card className=\"(mx-auto mt-16 max-w-2xl p-8 text-center|p-8|border-2 border-primary p-8)\"' \
  app/pricing/pricing-view.tsx
# Expected: 4 matches
```
