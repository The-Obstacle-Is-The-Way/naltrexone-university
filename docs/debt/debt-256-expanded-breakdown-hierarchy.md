# DEBT-256: Expanded Breakdown Visual Hierarchy

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** STRUCT-1
**Blocked by:** Decision 4 (Expanded Breakdown Background) + DEBT-252 merged
**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

---

## Item

### STRUCT-1: Expanded Breakdown Visual Hierarchy

**Severity:** HIGH (highest in entire audit)

**Problem:** When a history session card is expanded via "View breakdown", the expanded content area sits inside the same `bg-muted/20` container with only a `border-t border-border/40` separator. The separator is nearly invisible. The "Review session" outline button nearly disappears against the muted background.

**Current** (`history-sessions-tab.tsx:255`):
```tsx
<div className="mt-3 space-y-2 border-t border-border/40 pt-3">
```

**Review session button** (`history-sessions-tab.tsx:257`):
```tsx
<Button asChild variant="outline" className="rounded-full">
```

**Target** (pending Decision 4 — recommended):
```tsx
<div className="mt-3 -mx-1 space-y-2 rounded-lg border border-border/30 bg-background/60 p-3">
  <Button asChild variant="default" className="rounded-full">
```

**Changes:**
1. Replace `border-t border-border/40 pt-3` with `rounded-lg border border-border/30 bg-background/60 p-3`
2. Add `-mx-1` for slight visual nesting
3. Promote "Review session" from `outline` to `default` variant (Decision 4 sub-question)

---

## Decision Dependency

**Decision 4** must resolve before implementation:
- **Recommended:** Inset background with `bg-background/60 border border-border/30`
- **Alternative:** `bg-card` (less effective separation)
- **Sub-question:** Promote "Review session" button to `default` variant?

**Sequencing:** Must merge **after DEBT-252** (which modifies hover/role on the same file's `<li>` elements).

---

## Verification

Visual: Expanded breakdown is distinguishable from parent card. "Review session" button is the most prominent element.
