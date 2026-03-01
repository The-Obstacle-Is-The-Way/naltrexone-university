# DEBT-258: Marketing Alignment

**Status:** Resolved
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-8, D-9, D-10, D-14, D-15
**Unblocked:** Decision 1 resolved (recommended: Monthly→outline, Annual→default, kill outlinePillClasses) + Decision 2 resolved (recommended: keep MetallicCtaButton as documented exception)
**Files:** `components/marketing/marketing-home.tsx`, `components/marketing/marketing-layout.tsx`, `app/(app)/app/layout.tsx` (Decision 2 alternative also touches `components/ui/metallic-cta-button.tsx` and `components/ui/metallic-border.tsx`)

---

## Items

### D-8: Brand Link L-4 Alignment

**Files:** `components/marketing/marketing-layout.tsx:16-17`, `app/(app)/app/layout.tsx:80`

Both brand links diverge from the canonical L-4 pattern.

**Current marketing brand classes** (`marketing-layout.tsx:16-17`):
```tsx
const brandLinkClass =
  'rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';
```

**Current app brand classes** (`app layout.tsx:80`):
```tsx
className="text-sm font-semibold text-foreground"
```

**Target classes:**
```
rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Implementation note:** Apply this class set directly in both files for this spec. Pattern Registry Part 10 extraction rule is `3+` files; this class currently appears in 2 files.

### D-9: Marketing Outline Pill Hover

**File:** `components/marketing/marketing-home.tsx:57-58`

**Current**:
```tsx
const outlinePillClasses =
  'h-auto rounded-full border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted';
```

**Target** (recommended):
```tsx
<Button asChild variant="outline" className="h-auto rounded-full px-6 py-3 text-sm font-medium">
```

Remove custom `outlinePillClasses`. Use `outline` variant with only sizing/shape overrides.

### D-10: Annual CTA Variant Bypass

**File:** `components/marketing/marketing-home.tsx:229-234`

**Current**:
```tsx
<Button
  asChild
  className="mt-8 h-auto w-full rounded-full bg-foreground py-3 text-sm font-medium text-background hover:bg-foreground/90"
>
```

**Target** (recommended):
```tsx
<Button asChild className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium">
```

Remove `bg-foreground text-background hover:bg-foreground/90`. Let `default` variant supply colors/hover.

### D-14: Monthly CTA Invisible in Dark Mode

**Severity:** HIGH

**File:** `components/marketing/marketing-home.tsx:202-208`

**Current**:
```tsx
<Button
  asChild
  variant="secondary"
  className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium"
>
```

**Target** (recommended):
```tsx
<Button
  asChild
  variant="outline"
  className="mt-8 h-auto w-full rounded-full py-3 text-sm font-medium"
>
```

Change `variant="secondary"` → `variant="outline"` for visible border in dark mode.

### D-15: MetallicCtaButton Exception

**File:** `components/marketing/marketing-home.tsx:253-257`

**Current**:
```tsx
<MetallicCtaButton href={ROUTES.PRICING}>
  Get Started
</MetallicCtaButton>
```

**Target** (implemented, Decision 2 recommended path):
```tsx
{/* @debt-exception D-15: Marketing-only metallic CTA. Do not expand to other pages. */}
<div data-debt-exception="D-15">
  <MetallicCtaButton href={ROUTES.PRICING}>
    Get Started
  </MetallicCtaButton>
</div>
```

Add explicit source comment and a machine-verifiable marker while keeping usage marketing-only.

---

## Decision Dependencies

**Decision 1 — RESOLVED:** Monthly→`outline`, Annual→`default`, remove `outlinePillClasses`. Verified: `--primary` = `--foreground` in dark mode — zero visual regression on annual CTA switch.

**Decision 2 — RESOLVED:** Keep MetallicCtaButton as documented marketing-only exception with `@debt-exception D-15` source comment and `data-debt-exception="D-15"` marker.

All items unblocked.

---

## Verification

```bash
# D-8: both brand links include the L-4 hover token
rg -n 'hover:text-foreground/80' \
  components/marketing/marketing-layout.tsx \
  'app/(app)/app/layout.tsx'
# Expected: 1 match in each file

# D-9: custom outlinePillClasses removed
rg -n 'const outlinePillClasses' components/marketing/marketing-home.tsx
# Expected: 0 matches

# D-9: no 100% muted hover override on pricing/sign-in pills
rg -n 'hover:bg-muted[" ]|hover:bg-muted$' components/marketing/marketing-home.tsx
# Expected: 0 matches (recommended path)

# D-10: annual CTA no longer bypasses variant colors (recommended path)
rg -n 'bg-foreground text-background|hover:bg-foreground/90' \
  components/marketing/marketing-home.tsx
# Expected: 0 matches unless Decision 1 selects an explicit inverted strategy

# D-14: monthly CTA no longer uses secondary variant (recommended path)
rg -n 'variant=\"secondary\"' components/marketing/marketing-home.tsx
# Expected: 0 matches

# D-15: exception marker present when keeping metallic CTA
rg -n '@debt-exception D-15' components/marketing/marketing-home.tsx
# Expected: 1 match on recommended Decision 2 path

# D-15: machine-verifiable exception marker present
rg -n 'data-debt-exception=\"D-15\"' components/marketing/marketing-home.tsx
# Expected: 1 match on recommended Decision 2 path

# D-15: MetallicCtaButton usage stays marketing-only across repo
rg -n '<MetallicCtaButton' components \
  --glob '!**/*.test.tsx' \
  --glob '!**/*.spec.tsx'
# Expected: 1 match in marketing-home.tsx
#           (or 0 only if Decision 2 removes metallic CTA entirely)
```
