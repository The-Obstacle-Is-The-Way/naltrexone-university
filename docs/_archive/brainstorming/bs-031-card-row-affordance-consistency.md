# BS-031: Card/Row Affordance Consistency Audit

**Date:** 2026-02-23
**Triggered by:** SPEC-038 hardening added card-level `onClick`/`onKeyDown`/`tabIndex` to history session cards, revealing asymmetry with question cards on the same page
**Scope:** Audit card/row interactive patterns across the app and propose a unified approach
**Related:** SPEC-038 (History Page Hardening), BS-020 (Card Contrast and Hover Consistency)

---

## The Problem

During SPEC-038 work, we made history session cards fully clickable (card-level `onClick` with keyboard support and click-guard logic). This immediately highlighted an inconsistency: history question cards on the **same page** require users to click the title link or "Review" button — the card itself is not interactive.

The broader audit found multiple interaction affordance inconsistencies, including missing focus-visible treatment and misleading hover on non-interactive cards.

## Decision (Locked)

Adopt the following interaction policy:

1. **Pattern A (Link-as-Card)** for single-destination cards.
2. **Pattern C (card-level onClick with guard)** only when a row has a primary navigation action plus additional distinct controls.
3. **Pattern B (inner targets)** only when there is no single primary row-level navigation target.

Applied to History:

- **Questions tab:** move from Pattern B to Pattern A.
- **Sessions tab:** keep Pattern C.

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

**Evidence:** `app/(app)/app/history/components/history-sessions-tab.tsx` lines 179–213.

## Inconsistencies Found

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | Sessions tab uses Pattern C, Questions tab uses Pattern B — asymmetry within the same History page | P1 | `history-sessions-tab.tsx` lines 179–213 vs `history-questions-tab.tsx` lines 511–552 |
| 2 | Dashboard and session-summary stat cards have `hover:bg-muted/50` but are NOT clickable — misleading affordance | P2 | `dashboard/page.tsx` lines 61–95, `practice/[sessionId]/components/session-summary-view.tsx` lines 40–61 |
| 3 | Marketing feature cards have `hover:bg-muted` but are NOT clickable — misleading affordance | P2 | `components/marketing/marketing-home.tsx` line 155 |
| 4 | History question title links lack `focus-visible` ring (no `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`) | P3 | `history-questions-tab.tsx` line 517 |
| 5 | Session breakdown list links lack `focus-visible` ring | P3 | `session-breakdown-list.tsx` line 34 |
| 6 | Bookmark title links lack `focus-visible` ring | P3 | `bookmarks/page.tsx` line 96 |
| 7 | History sessions LI row now has `focus-visible` classes; `role="link"` from the original audit is no longer present (inner `<Link>` still uses `tabIndex={-1}`) | Resolved | `history-sessions-tab.tsx` lines 181–220 |
| 8 | Dark mode `--ring: 0 0% 40%` at 50% opacity may fail WCAG 3:1 contrast for focus indicators | P3 | `app/globals.css` line 152 |

### Finding 1 Detail

On the History page, switching between "Sessions" and "Questions" tabs changes the interaction model. Session cards navigate on click anywhere; question cards require clicking the title or "Review" button. This is confusing because both tabs render visually similar card lists.

### Finding 2–3 Detail

Dashboard stat/streak cards, practice session-summary stat cards, and marketing feature cards all use hover color transitions while remaining non-interactive containers. This creates a false click affordance.

### Finding 4–6 Detail

The title `<Link>` in history question cards, session breakdown links, and bookmark title links use `hover:underline` but do not apply the app-standard `focus-visible` ring class set. Compared with dashboard Link-as-Card elements, keyboard affordance is inconsistent and weaker.

### Finding 7 Detail (current code check)

The history sessions `<li>` row is keyboard-focusable when interactive (`tabIndex={isRowInteractive ? 0 : undefined}` at line 181) and now includes explicit focus-visible styling in its interactive class branch (`focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` at line 185). The inner `<Link>` still has `tabIndex={-1}` (line 219). `role="link"` is not currently present on the `<li>`. This means the original missing-focus-ring concern is resolved.

### Finding 8 Detail (from browser audit)

`app/globals.css` line 152 sets `--ring: 0 0% 40%` in dark mode. The standard focus ring class `focus-visible:ring-ring/50` applies 50% opacity on top, resulting in ~20% effective opacity gray on dark backgrounds. This may not meet WCAG 2.2 SC 1.4.11 (non-text contrast) 3:1 minimum for focus indicators. Light mode uses `--ring: 222.2 84% 4.9%` which is near-black and has excellent contrast.

## Severity Assessment

| Severity | Count | Impact |
|----------|-------|--------|
| P1 | 1 | Interaction model inconsistency within the same page — confuses users |
| P2 | 2 | Misleading hover affordances on non-interactive cards |
| P3 | 4 | Missing focus-visible rings on inner links + dark mode ring contrast concern |
| Resolved | 1 | History sessions LI row focus ring gap closed; original `role="link"` observation is stale |

## Proposed Fix (Locked Direction)

### Strategy: Use semantic-first pattern split

1. **Single-action cards → Pattern A (Link-as-Card):** If a card has one primary navigation action, wrap the entire card in `<Link>`. This covers:
   - History question cards (primary action: review the question)
   - Session breakdown list items (optional: primary action is review)

2. **Multi-action cards with row-level nav intent → Pattern C:** If the row itself should navigate but contains secondary interactive controls, keep Pattern C and ensure the focusable container has explicit `focus-visible` classes. History session rows currently fit this model.

3. **Remove misleading hover on non-interactive cards:** Strip hover color transitions from dashboard stat cards, practice session-summary stat cards, and marketing feature cards unless they become interactive.

4. **Add `focus-visible` ring to all interactive card links and focusable rows:** Ensure every `<Link>` inside a card AND every focusable container (`<li>` with `tabIndex={0}`) uses `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

5. **Consider dark mode ring contrast improvement:** `--ring: 0 0% 40%` in dark mode may produce insufficient contrast at 50% opacity. Potential fix: increase to `--ring: 0 0% 60%` or use a brand-colored ring in `.dark`.

### Migration path

- Findings 2–6 are small, low-risk class-string fixes.
- Finding 1 is resolved: keep session rows as Pattern C and promote question rows to Pattern A.
- `components/theme-token-regression.test.tsx` currently asserts the existing hover token pattern on dashboard/session-summary stat cards and will need updates if hover is removed.
- Optional follow-up: evaluate a stretched-link approach for session rows if we want to reduce LI click-handler complexity while keeping breakdown as a distinct action.
- Optional follow-up: evaluate de-duplicating Bookmarks' title-link + review-link same-destination pattern while preserving a distinct Remove action.

## Open Questions

1. Should non-interactive stat cards ever link somewhere (e.g., "Total answered" → history questions tab) so hover affordance is justified?
2. Is there value in a shared `InteractiveCard` component to encapsulate Pattern C click-guard/focus behavior for future multi-action rows?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-23 | Use Pattern A for history question cards; keep Pattern C for history session rows | Question cards are single-destination navigation; session rows are genuinely multi-action |
