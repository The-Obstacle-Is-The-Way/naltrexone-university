# BS-036: History Page Breakdown UX Redesign

**Date:** 2026-03-01
**Triggered by:** Visual review of history session expansion behavior and breakdown readability
**Scope:** Re-audit and redesign recommendation for expanded history session breakdown UI
**Related:** [BS-035](./bs-035-card-hover-and-gray-consistency-audit.md), [SPEC-038](../_archive/specs/spec-038-history-ux-remediation.md)

---

## Executive Verdict

The original BS-036 identified real issues, but its final recommendation (Option A flat expansion + remove "Review session") is not the strongest end state.

From first principles, the best direction is **Option D (Hybrid Disclosure)**:
- fix the dark-mode layering bug,
- materially improve list scan-ability,
- preserve explicit "start from question 1" discoverability,
- and add accessibility + mobile behavior hardening.

---

## Current State (Code-Verified)

- Expanded container in history sessions currently uses:
  - `rounded-lg border border-border/30 bg-background/60 p-3`
  - Source: `app/(app)/app/history/components/history-sessions-tab.tsx`
- Expanded panel currently renders a primary `Review session` CTA linking to question 1.
- `SessionBreakdownList` currently renders a plain `space-y-2` list of text rows with inline result labels.
  - Source: `app/(app)/app/shared/components/session-breakdown-list.tsx`

---

## First-Principles Audit of the Four Original Problems

### 1) Inner-card layering (dark mode)
**Verdict:** Valid and high-impact.

`bg-background/60` inside a `bg-muted/20` row creates an inverted depth signal in dark mode. It reads as a darker cutout inside a lighter card-like row.

### 2) Hover-state disconnect
**Verdict:** Real, but overstated in priority.

This is polish-level inconsistency, not the primary usability failure. The larger usability issue is list readability and dense scanning under expansion.

### 3) "Review session" redundancy
**Verdict:** Partially true; "remove entirely" is too aggressive.

Yes, there are multiple paths to question 1. But fully removing the explicit CTA increases discoverability risk because row-click navigation is implicit and breakdown intent is often "inspect + decide where to resume".

### 4) Breakdown list feels like a text dump
**Verdict:** Valid and under-prioritized in the original doc.

For up to 20 rows, this is the most meaningful UX problem: weak visual grouping, weak status hierarchy, and poor mobile scan behavior.

---

## Correct Priority Order

1. **Breakdown information density and scan-ability** (desktop + mobile)
2. **Navigation clarity/discoverability** (question 1 entry vs deep links)
3. **Surface hierarchy fix** (remove inverted dark layering)
4. **Hover continuity polish**

---

## Option Review

### Option A: Flat Expansion
**Assessment:** Good quick fix, weak final design.

Pros:
- Lowest implementation cost
- Fixes the obvious dark layering bug

Cons:
- Does not solve list readability at 20 items
- Removes too much visual containment
- Increases risk that expanded state feels "spilled" rather than structured

### Option B: Subtle Inset
**Assessment:** Better than A; still incomplete alone.

Pros:
- Keeps clean hierarchy
- Allows structured content shell

Cons:
- Needs explicit list-row structure to avoid text-dump feeling

### Option C: Card-in-Card
**Assessment:** Strong structure, but likely too heavy for this context.

Pros:
- Strong affordance
- Very clear row separation

Cons:
- Can over-weight nested surfaces
- Higher complexity for a shared list component

---

## Recommended Option D (Hybrid Disclosure)

Option D combines the best parts of B and C without the visual heaviness.

### D-1. Surface hierarchy (fix layering, keep containment)
- Replace dark inset treatment with a neutral disclosure stack:
  - outer separation: `mt-3 border-t border-border/40 pt-3`
  - inner shell: `rounded-lg border border-border/40 bg-muted/10`

### D-2. Keep explicit "start at question 1" affordance, but de-emphasize
- Do **not** keep a primary filled button here.
- Replace with a low-visual-weight content action link (for example `Start from question 1`) using content-link treatment.
- Rationale: preserve discoverability without competing with per-question links.

### D-3. Restructure breakdown rows for scan-ability
Inside `SessionBreakdownList`, move from bare flex text rows to a structured row pattern:
- list shell: `divide-y divide-border/30`
- row: `grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-2`
- link text: `min-w-0 truncate sm:whitespace-normal sm:line-clamp-2`
- status badges:
  - Correct: `inline-flex rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success`
  - Incorrect: `inline-flex rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive`
  - Unanswered: `inline-flex rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground`

### D-4. Mobile + long-list behavior
For 20-item sessions, avoid runaway card height:
- container viewport: `max-h-[min(55vh,28rem)] overflow-y-auto overscroll-contain`
- enforce `min-w-0` on text columns to avoid flex overflow/truncation bugs

### D-5. Accessibility hardening
- Add `aria-expanded` and `aria-controls` to "View breakdown" button
- Add corresponding `id` + `role="region"` on expanded panel
- Keep existing focus-ring treatment on links/buttons

### D-6. Loading, error, and empty-ready states
- Keep existing loading and error rendering.
- Add explicit empty-ready message when expanded review has zero rows.

---

## Missing Analysis from Original BS-036 (Now Covered)

- Light mode behavior (problem is less severe than dark mode but still benefits from clearer structure)
- Mobile viewport density and truncation strategy
- Screen reader wiring for disclosure semantics (`aria-expanded` + `aria-controls`)
- Long-list scroll behavior for 20 questions
- Empty-ready state when review fetch succeeds with zero rows
- Discoverability tradeoff of removing the explicit question-1 entrypoint

---

## "Review session" Decision

**Decision:** Do not remove the question-1 action completely. Replace current primary button with a lower-prominence content action.

This balances:
- explicitness for first-time and returning users,
- lower CTA noise in expanded detail mode,
- and clearer hierarchy between "resume from start" vs "jump to specific question".

---

## Implementation Sketch (Scope)

1. `history-sessions-tab.tsx`
- Replace expansion container surface classes per D-1.
- Replace primary `Review session` button with subtle link-style action.
- Add disclosure ARIA wiring per D-5.
- Add empty-ready state text.

2. `session-breakdown-list.tsx`
- Add row shell structure and status badge treatment per D-3.
- Add robust truncation/wrapping classes and `min-w-0` per D-4.

3. Tests
- Update session tab/browser tests for disclosure ARIA and revised question-1 action.
- Update list render tests for structured row/status badge classes and empty-ready behavior.

---

## Open Questions

1. Should unanswered rows be grouped/collapsible after a threshold (for example 10+ unanswered)?
2. Should the question-1 action text be `Start from question 1` or `Review from question 1`?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-01 | Created BS-036 | History breakdown UX needed focused follow-up from BS-035 |
| 2026-03-01 | Re-audited from first principles | Original problem set mostly valid, but priority and final recommendation required correction |
| 2026-03-01 | Recommend Option D (Hybrid Disclosure) | Best balance of hierarchy, readability, discoverability, and implementation complexity |
