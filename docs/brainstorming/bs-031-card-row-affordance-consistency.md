# BS-031: Card/Row Affordance Consistency Audit

**Date:** 2026-02-23
**Triggered by:** SPEC-038 hardening added card-level `onClick`/`onKeyDown`/`tabIndex` to history session cards, revealing asymmetry with question cards on the same page
**Scope:** Audit card/row interactive patterns across the app and propose a unified approach
**Related:** SPEC-038 (History Page Hardening), BS-020 (Card Contrast and Hover Consistency)

---

## The Problem

During SPEC-038 work, we made history session cards fully clickable (card-level `onClick` with keyboard support and click-guard logic). This immediately highlighted an inconsistency: history question cards on the **same page** require users to click the title link or "Review" button — the card itself is not interactive.

A broader audit found three distinct interaction patterns in use across the app, with no clear rationale for which pattern is used where.

## Three Interaction Patterns Currently in Use

### Pattern A: Link-as-Card

The entire card is a `<Link>` element styled as a card. Clicking anywhere navigates.

**Used in:** Dashboard recent sessions list, dashboard recent activity list.

```
<li>
  <Link href={...} className="block rounded-xl border ...">
    ...card content...
  </Link>
</li>
```

**Pros:** Best semantics (native `<a>` element), keyboard-accessible by default, `focus-visible` ring works naturally.
**Cons:** Cannot contain other interactive elements without nested-link issues.

**Evidence:** `app/(app)/app/dashboard/page.tsx` lines 145–147 (sessions) and lines 220–226 (activity).

### Pattern B: Card with Inner Targets

The card is a display-only `<Card>` or `<li>`. Interactive elements (links, buttons) are inside.

**Used in:** History questions tab, session breakdown list.

```
<Card>
  <Link href={...}>Title</Link>
  <Button asChild><Link href={...}>Review</Link></Button>
</Card>
```

**Pros:** Supports multiple actions per card. No nested-link issues.
**Cons:** Card appears interactive (border, spacing) but clicking empty space does nothing. Users must discover the specific clickable targets.

**Evidence:** `app/(app)/app/history/components/history-questions-tab.tsx` lines 511–552.

### Pattern C: Card with Card-Level onClick

The `<li>` has `onClick`, `onKeyDown`, and `tabIndex={0}`. A click guard skips activation when the user clicks inner links/buttons.

**Used in:** History sessions tab.

```
<li tabIndex={0} onClick={...} onKeyDown={...}>
  <Link href={...}>Session summary</Link>
  <Button>View breakdown</Button>
</li>
```

**Pros:** Entire card is clickable, best discoverability. Keyboard-accessible.
**Cons:** Most complex — requires click-guard logic, manual `tabIndex`, `onKeyDown` for Enter/Space. Semantically a `<li>` acting as a link.

**Evidence:** `app/(app)/app/history/components/history-sessions-tab.tsx` lines 177–203.

## Inconsistencies Found

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | Sessions tab uses Pattern C, Questions tab uses Pattern B — asymmetry within the same History page | P1 | `history-sessions-tab.tsx` lines 177–203 vs `history-questions-tab.tsx` lines 511–552 |
| 2 | Dashboard stat cards have `hover:bg-muted/50` transition but are NOT clickable — misleading affordance | P2 | `dashboard/page.tsx` lines 61–91 |
| 3 | History question title links lack `focus-visible` ring (no `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`) | P3 | `history-questions-tab.tsx` line 517 |
| 4 | Session breakdown list links lack `focus-visible` ring | P3 | `session-breakdown-list.tsx` line 34 |

### Finding 1 Detail

On the History page, switching between "Sessions" and "Questions" tabs changes the interaction model. Session cards navigate on click anywhere; question cards require clicking the title or "Review" button. This is confusing because both tabs render visually similar card lists.

### Finding 2 Detail

The four stat cards ("Total answered", "Overall accuracy", etc.) and the streak card all apply `hover:border-border hover:bg-muted/50` which creates a hover affordance suggesting they are clickable. They are not. Users may click repeatedly expecting navigation.

### Finding 3–4 Detail

The title `<Link>` in question cards (`history-questions-tab.tsx` line 517) uses `hover:underline` but has no `focus-visible` ring styling. Compare with dashboard `<Link>` cards which include `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`. Similarly, `session-breakdown-list.tsx` line 34 has `hover:underline` but no focus ring.

## Severity Assessment

| Severity | Count | Impact |
|----------|-------|--------|
| P1 | 1 | Interaction model inconsistency within the same page — confuses users |
| P2 | 1 | Misleading hover affordance on non-interactive elements — wastes user clicks |
| P3 | 2 | Missing focus-visible rings — keyboard navigation gap |

## Proposed Fix (Sketch)

### Strategy: Unify on Pattern A where possible

1. **Single-action cards → Pattern A (Link-as-Card):** If a card has one primary navigation action, wrap the entire card in `<Link>`. This covers:
   - History question cards (primary action: review the question)
   - Session breakdown list items (primary action: review the question)

2. **Multi-action cards → Pattern B (Card with inner targets):** If a card has genuinely distinct actions (e.g., "View breakdown" AND "Review session"), keep Pattern B. The session cards on the History page fit here since they have both a breakdown toggle and a review link.

3. **Remove misleading hover on non-interactive stat cards:** Strip `hover:border-border hover:bg-muted/50` from dashboard stat cards that don't navigate anywhere.

4. **Add `focus-visible` ring to all interactive card links:** Ensure every `<Link>` inside a card uses `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

### Migration path

- Finding 2 (stat card hover) and Findings 3–4 (focus rings) are small, low-risk fixes.
- Finding 1 (pattern unification) requires deciding whether session cards should lose their card-level `onClick` (if we keep the breakdown toggle) or whether question cards should gain it.

## Open Questions

1. Should session cards keep Pattern C (card-level onClick) given they have two actions (breakdown + review)? Or should they adopt Pattern B with better inner-target styling?
2. Should stat cards ever link somewhere (e.g., "Total answered" → history questions tab)? If yes, they become Pattern A and the hover is justified.
3. Is there value in a shared `InteractiveCard` component to encapsulate Pattern C's click-guard logic if we keep it?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-23 | Document as brainstorming; defer implementation to a future spec | Inconsistencies are real but non-blocking; need UX direction on pattern unification |
