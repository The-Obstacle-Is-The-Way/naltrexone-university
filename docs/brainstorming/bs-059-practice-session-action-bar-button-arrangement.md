# BS-059: Session Review Question Page Action Bar — Button Arrangement and Grouping

**Date:** 2026-03-21
**Triggered by:** DEBT-330 investigation revealed the same bookmark-between-nav-controls problem exists on the question review / session review bottom action bar (`question-page-client.tsx:371-470`), but with more buttons and more state combinations making it harder to reason about in isolation.
**Scope:** Audit the question review / session review bottom action bar's arrangement across all states (pre-submit, post-submit, review mode, session nav present/absent) and determine if the button grouping needs the same kind of fix as DEBT-330 (post-exam review surface).
**Related:** [BS-061](./bs-061-review-surface-divergence-audit.md), [DEBT-330 (resolved)](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md), [BS-052](./bs-052-bookmark-icon-toggle-replacement.md), [BS-019 (archived)](../_archive/brainstorming/bs-019-action-bar-label-and-ordering-consistency.md)

**Status:** Active — still unresolved on `question-page-client.tsx`. Post-exam review was fixed by DEBT-330 (PR #241), and the active tutor practice bar already renders `Previous / Next / Bookmark` after feedback, but the question review / session review surface still keeps bookmark between reattempt/previous controls and next/back controls.

**Boundary update (2026-04-07):** Direction C from BS-061 is now promoted into [DEBT-350](../_archive/debt/debt-350-exam-results-session-continuity.md) and no longer depends on this doc. BS-059 remains active because the standalone `question-page-client.tsx` action-bar contract across its multiple states is still broader than the now-decided exam-flow continuity work.

---

## The Problem

The bottom action bar at `question-page-client.tsx:371-470` renders up to 6 different buttons depending on state. This is the review/question page surface reached from History, Bookmarks, Dashboard, Summary, or session navigation. The active tutor practice surface is related context, but not the current unresolved layout problem.

The combinations are:

### Button inventory

| Button | When visible | Variant | Purpose |
|--------|-------------|---------|---------|
| Previous | Session nav + has previous question | `outline` pill (Link) | Navigate back |
| Submit | Not yet submitted, not unanswered reveal | `default` pill | Primary action |
| Try Again / Reattempt | Post-submit + reattempt available | `outline` pill | Secondary action |
| Bookmark | Review mode + bookmark hydrated | `outline` pill | Tertiary action |
| Next | Session nav + has next question | `outline` pill (Link) | Navigate forward |
| Back to... | History origin, session nav, or post-submit | `ghost` pill (Link) | Exit to origin |

### State combinations (what the user actually sees)

**Pre-submit (first question, no session nav):**

```text
[ Submit ]
```

**Pre-submit (with session nav):**

```text
[ Previous ]  [ Submit ]  [ Next ]  [ Back to... ]
```

**Post-submit (tutor mode, with session nav):**

```text
[ Previous ]  [ Try Again ]  [ Bookmark ]  [ Next ]  [ Back to... ]
```

**Review mode (session review, with nav):**

```text
[ Previous ]  [ Bookmark ]  [ Next ]  [ Back to... ]
```

**Review mode (first question, session review):**

```text
[ <spacer> ]  [ Bookmark ]  [ Next ]  [ Back to... ]
```

### What's messy

1. **Bookmark placement shifts meaning by context.** In review mode without Try Again, `[ Previous ] [ Bookmark ] [ Next ]` is the same ambiguity as DEBT-330. With Try Again present, Bookmark sits after Try Again and before Next — it's less confusing because Try Again acts as a visual buffer, but the grouping is still arbitrary.

2. **Up to 5 visible buttons on one row.** `[ Previous ] [ Try Again ] [ Bookmark ] [ Next ] [ Back to... ]` is a lot. On mobile these stack vertically into a 5-item column.

3. **No visual grouping.** All buttons share the same flex container with `gap-3`. There's no separation between navigation (Previous/Next), actions (Submit/Try Again), secondary actions (Bookmark), and exit (Back to...). Everything is visually flat.

4. **The spacer `<span />`** on the first question (no Previous) preserves layout but creates an invisible gap that only makes sense on desktop. On mobile (flex-col), it's a zero-height element doing nothing.

5. **BS-052 overlap.** If BS-052 lands (bookmark icon toggle), the Bookmark button becomes an icon — which changes the visual weight and potentially the ideal placement. These two efforts should be coordinated.

## How This Differs from DEBT-330

DEBT-330 is narrowly scoped: the post-exam review action bar has exactly 3 buttons (Previous, Bookmark, Next/Finish review) and the fix is straightforward — separate Bookmark from the nav pair.

This surface has 6 possible buttons across multiple states. The fix isn't just "move Bookmark" — it's potentially rethinking how buttons are grouped across the entire bar. That's a design exploration, not a debt paydown.

### What is already resolved elsewhere

- **Post-exam review**: DEBT-330 shipped navigation-first ordering with trailing Bookmark (PR #241)
- **Active tutor practice bar**: the live `PracticeView` action bar already renders `Previous / Next / Bookmark` after feedback instead of sandwiching bookmark between the nav controls

## Severity Assessment

**Low-medium.** The bar works. Users can find and press all the buttons. The confusion is subtle:

- Bookmark between nav controls (same as DEBT-330 but masked by more buttons)
- Visual flatness (all buttons look equally important)
- Mobile stacking produces a tall column of 4-5 pills

This is polish, not broken functionality.

## Possible Directions (Not Proposals Yet)

1. **Apply the same DEBT-330 fix** — push Bookmark to the far right with `ml-auto`, keep everything else in source order. Simple, consistent with the post-exam review pattern that DEBT-330 already shipped.

2. **Group buttons into zones** — Navigation (Previous/Next) left, Actions (Submit/Try Again) center, Secondary (Bookmark) + Exit (Back to...) right. Use spacers or nested flex containers.

3. **Wait for BS-052** — if Bookmark becomes an icon, it naturally becomes smaller and less visually competitive. The placement question becomes easier because an icon reads differently than a text pill.

4. **Audit whether all buttons need to be visible simultaneously** — does "Back to..." need to be in the action bar, or could it be a more subtle link elsewhere? Does Try Again need to be in the same row as navigation?

## Open Questions

1. How closely should this surface mirror the DEBT-330 pattern now that post-exam review already ships it?
2. Does BS-052 (icon toggle) need to land before or after this?
3. Is the 5-button mobile stack actually a problem users have noticed, or is it theoretical?
4. Should "Back to..." move out of the action bar entirely (e.g., breadcrumb or top-of-page link)?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Created BS-059 | DEBT-330 investigation surfaced that the practice session action bar has the same bookmark placement issue plus additional complexity from more buttons and state combinations. Needs its own exploration separate from the narrowly-scoped DEBT-330 fix. |
| 2026-03-21 | Not blocking DEBT-330 | The post-exam review fix can land independently. This doc captures the broader question for future work. |
| 2026-03-21 | DEBT-330 resolved independently | Post-exam review now ships navigation-first ordering with trailing Bookmark, so this doc now represents a follow-up consistency exploration rather than a dependency blocker. |
| 2026-03-29 | Tightened scope to the live unresolved surface | The active tutor practice bar is no longer the primary issue. The still-open layout problem is the question review / session review bottom action bar in `question-page-client.tsx`, which continues to render bookmark between reattempt/previous controls and next/back controls. |
| 2026-04-07 | Remains brainstorming, not debt | Direction C exam-flow continuity is now tracked in DEBT-350. BS-059 stays active because the standalone `question-page-client.tsx` action-bar contract still needs a final multi-state decision before promotion. |
