# DEBT-255: Mobile Nav Hover

**Status:** Resolved (2026-02-28)
**Parent:** [DEBT-250](../../debt/debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-16
**Decision 10:** Resolved — `hover:bg-muted/50` (see DEBT-250 for rationale)
**File:** `components/mobile-nav.tsx`

---

## Item

### D-16: Mobile Nav Inactive Hover Intensity

**Pattern:** L-6 (Mobile Menu Link)

**Current** (`mobile-nav.tsx:75`):
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Target** (Decision 10 resolved):
```
block rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Change:** `hover:bg-muted` (100%) → `hover:bg-muted/50`

**Active state note:** The active mobile nav link uses `bg-muted` (100%) at line 74. This is intentional: **active fill > hover fill**.

---

## Decision Dependency

**Decision 10** — Resolved. Use `hover:bg-muted/50 hover:text-foreground`.

Active link uses `bg-muted` (100%). Hover at 100% is visually identical to active, breaking the active > hover > resting hierarchy. The opacity scale defines `/50` as the standalone hover slot, and L-6 in the Pattern Registry already documents this as canonical.

---

## Verification

```bash
# D-16 legacy class removed
rg -n 'hover:bg-muted hover:text-foreground' components/mobile-nav.tsx
# Expected: 0 matches

# D-16 target class present
rg -n 'hover:bg-muted/50 hover:text-foreground' components/mobile-nav.tsx
# Expected: 1 match (inactive links)

# Active-state contrast remains stronger than hover
rg -n "bg-muted px-3 py-3 text-sm font-medium text-foreground" components/mobile-nav.tsx
# Expected: 1 match (active link)
```
