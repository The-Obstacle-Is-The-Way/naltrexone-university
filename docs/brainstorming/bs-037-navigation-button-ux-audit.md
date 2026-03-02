# BS-037: Navigation Button UX Audit — Arrows, Visibility, and Contextual Hiding

**Date:** 2026-03-01
**Triggered by:** Visual review of Quick Practice and Tutor Session screens
**Scope:** Arrow symbols on navigation buttons feel unnecessary; disabled Previous button on first question wastes space; Back to Practice link styling
**Related:** BS-018 (Question View UX Unification), BS-019 (Action Bar Label and Ordering Consistency), SPEC-030, SPEC-032

---

## The Problems

Three navigation UX concerns identified from manual review of Quick Practice and Tutor Session modes.

### Problem 1: Arrow symbols on navigation buttons add visual noise

**What the user sees:**
- `← Previous` and `Next →` on the bottom action bar
- `← Back to Practice` on the top-right of Quick Practice

The arrow characters (`←` / `→`) don't add information — the words "Previous" and "Next" already communicate direction. The arrows add visual clutter, especially on mobile where button space is at a premium.

**Where arrows appear today:**

| Location | Text | File |
|----------|------|------|
| In-session action bar (Tutor/Exam) | `← Previous` | `practice-view.tsx:271` |
| In-session action bar (all modes) | `Next →` | `practice-view.tsx:298` |
| Session review action bar | `← Previous` | `question-page-client.tsx:347-362` |
| Session review action bar | `Next →` | `question-page-client.tsx:399-414` |
| Quick Practice top-right | `← Back to Practice` | `quick-practice-client.tsx:76` |

**Where arrows are already absent:**

| Location | Text | File |
|----------|------|------|
| History pagination | `Previous` / `Next` | `history-sessions-tab.tsx:285-301` |
| History pagination | `Previous` / `Next` | `history-questions-tab.tsx:509-529` |
| Error page links | `Back to Practice` | `quick/error.tsx:19`, `[sessionId]/error.tsx:19` |

The inconsistency is notable — History pagination already uses plain text without arrows.

### Problem 2: Disabled Previous button on first question is dead UI

**What the user sees (Tutor Session, Question 1 of 20):**

```
[← Previous (disabled/grayed)]  [Submit]  [Next →]  [Bookmark]
```

When viewing the first question, the Previous button is shown but disabled. This is dead UI — it takes up space, draws the eye, and communicates nothing useful. The user already knows they're on Question 1 from the navigator and subtitle ("Question 1 of 20").

**Current behavior by context:**

| Context | First Question | Last Question |
|---------|---------------|---------------|
| In-session (Tutor/Exam) | Previous shown, disabled | Next shown, disabled |
| Session review | Previous rendered as disabled `<button>` | Next rendered as disabled `<button>` |
| Quick Practice | No Previous (no session navigation) | N/A (infinite stream) |

**Proposed:** Hide (don't render) the Previous button on the first question. Similarly, hide Next on the last question. This is cleaner than showing grayed-out buttons.

**Parallel from this codebase:** History pagination already does this — the Previous link is **not rendered** when `offset === 0` (replaced by an empty span for layout). The Next link is not rendered when `!hasNextPage`.

### Problem 3: "Back to Practice" link position and arrow on Quick Practice

**What the user sees:**

The `← Back to Practice` link sits in the top-right corner of the Quick Practice page. Two concerns:

1. The `←` arrow is unnecessary — "Back to Practice" already implies direction
2. The top-right position may be fine for desktop but could be worth evaluating for mobile

**Note:** The Back link label is already contextual and well-implemented — it changes based on origin ("Back to Session", "Back to Practice", "Back to History", "Back to Bookmarks"). The concern is only about the arrow prefix.

---

## Severity Assessment

- **Arrow symbols:** Low severity, cosmetic. But affects every question-answering screen.
- **Disabled Previous on first question:** Low-medium. Dead UI is a design smell but not a functional problem.
- **Back link arrow:** Low severity, cosmetic.

None are bugs. All are polish items.

---

## Affected Entry Points

| Screen | Elements Affected | File |
|--------|-------------------|------|
| Quick Practice | `← Back to Practice`, `Next →` | `quick-practice-client.tsx`, `practice-view.tsx` |
| Tutor Session (in-session) | `← Previous`, `Next →` | `practice-view.tsx`, `practice-session-page-view.tsx` |
| Exam Session (in-session) | `← Previous`, `Next →` | `practice-view.tsx`, `practice-session-page-view.tsx` |
| Session Review | `← Previous`, `Next →`, Back link | `question-page-client.tsx` |
| Error pages | Already clean (no arrows) | `quick/error.tsx`, `[sessionId]/error.tsx` |
| History pagination | Already clean (no arrows) | `history-sessions-tab.tsx`, `history-questions-tab.tsx` |

---

## Proposed Fix (Sketch)

### Fix 1: Remove arrow symbols from all navigation buttons

Change all button labels to plain text:

| Before | After |
|--------|-------|
| `← Previous` | `Previous` |
| `Next →` | `Next` |
| `← Back to Practice` | `Back to Practice` |
| `← Back to Session` | `Back to Session` |
| `← Back to History` | `Back to History` |
| `← Back to Bookmarks` | `Back to Bookmarks` |

This aligns with History pagination (already arrow-free) and error pages (already arrow-free).

### Fix 2: Hide Previous/Next at boundaries instead of disabling

**In-session practice (`practice-view.tsx`):**
- Don't render `← Previous` when `!hasPreviousQuestion` (instead of rendering disabled)
- Don't render `Next →` when `!hasNextQuestion` (instead of rendering disabled)

**Session review (`question-page-client.tsx`):**
- Don't render Previous when `navPrev === null` (first question)
- Don't render Next when `navNext === null` (last question)

**Layout consideration:** Use the same empty-span pattern from History pagination to preserve button bar alignment, or let the remaining buttons naturally fill the space.

### Fix 3: Remove arrow from Back links

Strip `← ` prefix from all Back link labels. The text alone is sufficient.

---

## Open Questions

1. **Hide vs disable — is there a layout shift concern?** When Previous disappears on question 1, does the Submit button jump left? May need a spacer or min-width on the action bar.
2. **Should we keep arrows only on mobile for touch affordance?** Some mobile UIs use arrows to make tap targets more discoverable. Desktop might not need them.
3. **Does the question navigator make Previous/Next redundant in session modes?** Tutor and Exam modes have a full grid navigator at the top — the bottom buttons are a secondary nav path. Could we rely solely on the navigator for random access and keep only Submit + Bookmark at the bottom? (Aggressive option — probably not, since linear navigation is the primary flow.)
4. **Should we apply the same hide-at-boundary pattern to the question navigator grid?** Currently the grid doesn't have this issue (all buttons are always shown), but worth considering for consistency.

---

## Test Impact

Existing tests assert on button text including arrows (e.g., `'← Previous'`, `'Next →'`). Changes would require updating:

| Test File | What Changes |
|-----------|-------------|
| `practice-view.test.tsx` | Button text assertions |
| `question-page-client.test.tsx` | Button text + first/last question disabled → hidden |
| `practice-session-page-view.browser.spec.tsx` | Button name in role queries |
| `quick-practice-client.test.tsx` | Back link text |
| `page.test.tsx` (quick practice) | Back link text |
| `history-sessions-tab.test.tsx` | Already arrow-free (no change) |
| `session-review-navigation.spec.ts` (E2E) | Button names |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-01 | Created BS-037 | Visual review of Quick Practice + Tutor Session screens |
