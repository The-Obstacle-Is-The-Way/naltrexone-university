# DEBT-255: Mobile Nav Hover

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-16
**Blocked by:** Decision 10 (Mobile Nav Hover Strategy)
**File:** `components/mobile-nav.tsx`

---

## Item

### D-16: Mobile Nav Inactive Hover Intensity

**Pattern:** L-6 (Mobile Menu Link)

**Current** (`mobile-nav.tsx:75`):
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target** (pending Decision 10 — recommended):
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Change:** `hover:bg-muted` (100%) → `hover:bg-muted/50`

**Active state note:** The active mobile nav link uses `bg-muted` (100%) at line 74. This is intentional: **active fill > hover fill**.

---

## Decision Dependency

**Decision 10** must resolve before implementation:
- **Recommended:** `hover:bg-muted/50 hover:text-foreground` — normalized to canonical hover scale
- **Alternative:** Text-only hover matching L-1 (no background)

---

## Verification

```bash
rg -n 'hover:bg-muted[" ]' components/mobile-nav.tsx
# Expected: 0 matches (inactive links)
```
