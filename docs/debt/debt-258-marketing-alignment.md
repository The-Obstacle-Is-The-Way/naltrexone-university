# DEBT-258: Marketing Alignment

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-8, D-9, D-10, D-14, D-15
**Blocked by:** Decision 1 (Marketing Pricing CTA Strategy), optionally Decision 2 (MetallicCtaButton Policy)
**Files:** `components/marketing/marketing-home.tsx`, `components/marketing/marketing-layout.tsx`, `app/(app)/app/layout.tsx`

---

## Items

### D-8: Brand Link L-4 Alignment

**Files:** `components/marketing/marketing-layout.tsx:16-17`, `app/(app)/app/layout.tsx:80`

Both brand links diverge from the canonical L-4 pattern. Target: extract to shared constant `brandLinkClasses` with full L-4 class set.

**Target classes:**
```
rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

### D-9: Marketing Outline Pill Hover

**File:** `components/marketing/marketing-home.tsx:57-58`

Remove custom `outlinePillClasses` const. Use `<Button variant="outline">` with sizing overrides only.

### D-10: Annual CTA Variant Bypass

**File:** `components/marketing/marketing-home.tsx:229-234`

Remove `bg-foreground text-background hover:bg-foreground/90` overrides. Let `default` variant provide standard colors.

### D-14: Monthly CTA Invisible in Dark Mode

**Severity:** HIGH

**File:** `components/marketing/marketing-home.tsx:202-208`

Change `variant="secondary"` → `variant="outline"` for visible border in dark mode.

### D-15: MetallicCtaButton Exception

**File:** `components/marketing/marketing-home.tsx:254-256`

Add `{/* @debt-exception D-15 */}` comment. Document as marketing-only exception.

---

## Decision Dependencies

**Decision 1** must resolve for D-9, D-10, D-14:
- **Recommended:** Monthly = `outline`, Annual = `default`, remove `outlinePillClasses`
- **Alternative:** Keep inverted annual CTA, add `inverted` variant

**Decision 2** must resolve for D-15:
- **Recommended:** Keep as documented exception
- **Alternative:** Remove metallic components entirely

---

## Verification

```bash
# No 100% muted hover in marketing
rg -n 'hover:bg-muted[" ]' components/marketing/marketing-home.tsx
# Expected: 0 matches

# No variant bypass colors (unless Decision 1 keeps inverted)
rg -n 'bg-foreground text-background' components/marketing/marketing-home.tsx
# Expected: 0 matches

# Brand links match L-4
rg -n 'hover:text-foreground/80' \
  components/marketing/marketing-layout.tsx \
  'app/(app)/app/layout.tsx'
# Expected: 1 match in each file
```
