# DEBT-250: Frontend Visual Divergence Compliance Plan (BS-035 + Pattern Registry D-1..D-15)

**Status:** Active  
**Priority:** P2  
**Date:** 2026-02-28  
**Owner:** Frontend/UI  
**Related:** [BS-035](../brainstorming/bs-035-card-hover-and-gray-consistency-audit.md), [Pattern Registry Part 11](../frontend/pattern-registry.md#part-11-known-divergences-from-this-registry), [Frontend Standards](../frontend/standards.md), [Design Principles](../frontend/design-principles.md)

---

## Description

BS-035 and the Pattern Registry identified 15 active visual divergences (`D-1` through `D-15`) plus 4 low-severity UX seams (pricing dead space, standalone review bookmark gap, marketing theme-toggle parity, Clerk visual seam).

This debt item is the implementation spec for bringing the codebase into compliance with the canonical frontend docs.

## Why this is debt (not one quick fix)

1. Divergences are spread across app shell, marketing shell, route pages, and shared primitives.
2. Several fixes require shared-constant extraction to prevent immediate drift regression.
3. Two items (`D-10`, `D-15`) require explicit product/design decisions, not just class-string edits.
4. Cross-doc consistency (`BS-035`, `pattern-registry.md`, `standards.md`) must be updated in lockstep after code fixes.

## Required change set

### A) Pattern Registry divergences (`D-1` through `D-15`)

| ID | Current | Target | Files |
|---|---|---|---|
| D-1 | History sessions row uses delegated `<li>` click + nested `<Link>` + `hover:bg-accent/40 dark:hover:bg-foreground/10` | Use direct interactive row pattern `I-1` (`hover:bg-muted/40`, no page-level `dark:` color overrides) | `app/(app)/app/history/components/history-sessions-tab.tsx` |
| D-2 | History questions row hover is `hover:bg-accent/40` | Use `I-2` hover `hover:bg-muted/50` | `app/(app)/app/history/components/history-questions-tab.tsx` |
| D-3 | Choice hover uses `hover:bg-muted/80` | Use `I-3` hover `hover:bg-muted/60` | `components/question/choice-button.tsx` |
| D-4 | Filter chip unselected hover uses `hover:bg-accent` | Use `I-4` hover `hover:bg-muted/50` | `components/ui/filter-chip.tsx` |
| D-5 | View-breakdown button has custom `dark:*` overrides | Remove custom `dark:*`; rely on outline variant dark behavior in `button.tsx` | `app/(app)/app/history/components/history-sessions-tab.tsx` |
| D-6 | Wrong-unselected choice state uses `opacity-60` | Standardize to `opacity-50` (state-modifier consistency) | `components/question/choice-button.tsx` |
| D-7 | Review navigator current pill uses `ring-2 ring-ring` | Use `X-2` ring `ring-[3px] ring-ring/50` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` |
| D-8 | Brand links do not match canonical L-4 class set | Align app + marketing brand links to L-4 (`rounded-md text-sm font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:*`) | `components/marketing/marketing-layout.tsx`, `app/(app)/app/layout.tsx` |
| D-9 | Marketing outline pills use full `hover:bg-muted` | Remove custom hover fill; use standard outline hover or canonical muted-opacity pattern | `components/marketing/marketing-home.tsx` |
| D-10 | Annual CTA bypasses variant system (`bg-foreground text-background ...`) | Replace with approved Button variant strategy (see Decision 1) | `components/marketing/marketing-home.tsx` |
| D-11 | Pricing page uses raw card-like `<div>` blocks | Replace with `<Card>` primitive (`S-1`) while preserving layout semantics | `app/pricing/pricing-view.tsx` |
| D-12 | Pricing dismiss uses `hover:opacity-70` | Replace with canonical link hover strategy (text-color based) | `app/pricing/pricing-view.tsx` |
| D-13 | `headerLinkButtonClasses` duplicated across 6 files | Extract shared constant `headerActionLinkClasses` to shared style module and consume everywhere | `app/(app)/app/dashboard/page.tsx`, `app/(app)/app/history/components/history-sessions-tab.tsx`, `app/(app)/app/history/components/history-questions-tab.tsx`, `app/(app)/app/practice/components/practice-view.tsx`, `app/(app)/app/bookmarks/page.tsx`, `app/(app)/app/practice/practice-page-client.tsx` |
| D-14 | Monthly CTA uses `variant="secondary"` with weak contrast in dark mode | Switch to stronger, approved variant strategy (see Decision 1) | `components/marketing/marketing-home.tsx` |
| D-15 | `MetallicCtaButton` remains outside standard variant system | Resolve as explicit approved exception or remove/replace (see Decision 2) | `components/ui/metallic-cta-button.tsx`, `components/ui/metallic-border.tsx`, `components/marketing/marketing-home.tsx` |

### B) Low-severity UX seams discovered in BS-035 Chunk 3

| Item | Current | Required resolution path | Files |
|---|---|---|---|
| Pricing subscribed-state dead space | `min-h-screen` + tiny centered card yields large blank region | Decide between (1) removing `min-h-screen` wrapper or (2) enriching subscribed panel with plan/account details | `app/pricing/pricing-view.tsx` |
| Standalone review has no bookmark | Quick practice action bar has bookmark; history individual review intentionally does not | Keep as intentional design-principles rule or promote to new feature spec | `app/(app)/app/questions/[slug]/question-page-client.tsx`, `docs/frontend/design-principles.md` |
| Marketing shell missing ThemeToggle | App shell has manual theme toggle; marketing shell does not | Add ThemeToggle to marketing shell or explicitly document “system-only on marketing” policy | `components/marketing/marketing-layout.tsx` |
| Clerk visual seam in dark mode | Clerk surfaces use non-app token styling | Either accept seam explicitly or add Clerk appearance token mapping in provider | `components/auth-nav.tsx`, `components/providers.tsx` |

---

## Required decisions (blockers)

1. **Decision 1 (D-10 + D-14): Marketing pricing CTA strategy**
   - Recommended: Monthly CTA = `outline`, Annual CTA = `default`.
   - Alternative: keep custom inverted annual CTA and add first-class `inverted` variant in `button.tsx`.
   - Must pick one strategy and document in Pattern Registry Part 5.

2. **Decision 2 (D-15): Metallic CTA policy**
   - Recommended: Keep as a single marketing-only exception with documented scope + no expansion.
   - Alternative: replace with standard Button variant and remove metallic components.

3. **Decision 3 (UX seam): Marketing theme toggle parity**
   - Recommended: Add `ThemeToggle` to marketing header for shell parity.
   - Alternative: keep absent and document as intentional.

---

## Execution order

1. **Foundation fixes:** D-1 through D-7, D-12 (core interaction/focus consistency).
2. **Brand/marketing alignment:** D-8 through D-11, D-14, D-15.
3. **Duplication removal:** D-13 shared-constant extraction.
4. **UX seam decisions:** pricing dead space, bookmark policy, theme-toggle parity, Clerk seam.
5. **Doc lockstep update:** BS-035, Pattern Registry Part 11, Standards §17.

---

## Acceptance criteria

- [ ] All active divergences in Pattern Registry Part 11 are resolved or explicitly approved as exceptions with rationale.
- [ ] No page/component code contains `dark:` color overrides for button/row hover behavior outside `components/ui/`.
- [ ] No usage of `hover:opacity-70` remains for link affordance.
- [ ] No `opacity-60` remains for interactive disabled/dimmed states where `opacity-50` is canonical.
- [ ] `headerActionLinkClasses` exists as one shared source and all 6 current consumers use it.
- [ ] Marketing and app brand links both conform to canonical `L-4` class strategy.
- [ ] Pricing card-like surfaces consume `<Card>` instead of manual card-like `<div>` classes.
- [ ] Documentation updates remove resolved divergences from Pattern Registry Part 11 and keep BS-035 factually aligned.

---

## Verification tracer bullets

### Vertical tracer bullets (file-level checks)

- `app/(app)/app/history/components/history-sessions-tab.tsx` has no `hover:bg-accent/40` and no `dark:hover:bg-foreground/10`.
- `app/(app)/app/history/components/history-questions-tab.tsx` has no `hover:bg-accent/40`.
- `components/question/choice-button.tsx` has no `hover:bg-muted/80` and no `opacity-60`.
- `components/ui/filter-chip.tsx` has no `hover:bg-accent` for unselected state.
- `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` uses `ring-[3px] ring-ring/50` for current item.
- `components/marketing/marketing-home.tsx` has no custom CTA class chains that bypass approved variant policy.
- `app/pricing/pricing-view.tsx` has no `hover:opacity-70` and no raw card-like wrapper classes where `Card` should be used.

### Horizontal tracer bullets (cross-doc checks)

- Pattern Registry Part 11 divergence table matches actual unresolved code only.
- BS-035 line references and class strings match post-fix source.
- Standards §17 references the correct divergence ID range.
- Pattern quick-reference table and detailed pattern sections remain consistent.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Visual regressions in high-traffic routes (history, pricing, question review) | Add route-level visual sanity pass and snapshot screenshots before/after |
| Over-correction on marketing CTAs reduces conversion affordance | Gate CTA decision behind explicit design review (Decision 1) |
| Shared-constant extraction introduces coupling churn | Keep constant naming narrow (`headerActionLinkClasses`), no broad “style bag” |
| Clerk seam customization adds maintenance burden | Only customize Clerk if decision explicitly approves ongoing ownership |
