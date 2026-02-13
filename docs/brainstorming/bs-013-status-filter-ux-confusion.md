# BS-013: Status Filter UX Confusion (Multi-Select OR Logic Is Not Obvious)

**Date:** 2026-02-12
**Triggered by:** Product owner confusion during manual testing — selecting multiple status chips feels contradictory ("How can a question be both unanswered AND incorrect?") because the UI implies AND but the code implements OR
**Scope:** The status filter chip UI on Practice and Quick Practice doesn't communicate its multi-select OR semantics, creating a confusing UX
**Related:** BS-012 (original status filter brainstorming), SPEC-024 (implementation spec, archived)

---

## The Problem

The status filter (Unanswered / Incorrect / Marked) works correctly in code but confuses users because:

1. **OR logic is invisible.** Selecting "Unanswered" + "Incorrect" shows questions from either bucket (union), but the UI reads as "show me questions that are somehow both unanswered and incorrect" (intersection) — which is impossible since they're mutually exclusive states.

2. **No default selection.** When nothing is selected, all questions are included. BS-012 originally proposed defaulting to "Unanswered" — the most common study intent. The current blank state gives no guidance.

3. **"Marked" is a different dimension.** "Unanswered" and "Incorrect" are progress states (mutually exclusive per question). "Marked" is a bookmark (orthogonal — a question can be marked AND unanswered, or marked AND incorrect, or marked AND correct). Presenting all three as peer chips in the same row conflates two different concepts.

4. **The "no filter" state is under-communicated.** "Nothing selected = all questions" is only explained via hint text ("Leave empty to include all questions"), which is easy to miss (and not shown on Quick Practice), so the empty state reads as either "no filter applied" or "I forgot to pick one".

## Evidence: BS-012 vs SPEC-024 Divergence

| Aspect | BS-012 (Brainstorming) | SPEC-024 (Implemented) |
|--------|----------------------|----------------------|
| Selection mode | Single-select | Multi-select (OR) |
| Default | Unanswered | None (= all) |
| "All" chip | Explicit chip | Removed; hint text only |
| Marked | Peer with others | Peer with others |

The brainstorming doc's original design was more intuitive. The spec's multi-select OR is more powerful but harder to grok.

## Root Cause Analysis

The three statuses are not peers — they span two dimensions:

```
Progress dimension (mutually exclusive per question):
  ├── Unanswered  (0 attempts)
  ├── Incorrect   (latest attempt wrong)
  └── Correct     (latest attempt right — not shown)

Bookmark dimension (orthogonal):
  ├── Marked      (bookmarked)
  └── Unmarked    (not bookmarked)
```

A question is always in exactly one progress state AND exactly one bookmark state. Presenting "Marked" alongside "Unanswered"/"Incorrect" as if they're the same type of thing is the core confusion.

## Severity Assessment

**Low-Medium.** The feature works correctly — no data bugs, no wrong results. But:
- Product owner was confused during first real use
- New users won't understand multi-select OR semantics without explanation
- The "none selected = all" default means users get unfiltered practice by default, which is the least targeted study mode

This is a UX polish issue, not a blocker. It should not delay ongoing spec work.

## Decision: Single-Select Segmented Control

Replace the multi-select chip group with a **single-select segmented control** defaulting to Unanswered. Reuse the existing Tutor/Exam mode segmented control component.

```
Status:  [ Unanswered | Incorrect | Bookmarked ]
                ↑ pre-selected on load
```

**Three segments, one active at a time.** The segmented control is inherently single-select, so OR/AND confusion is eliminated by the control type itself. The user is always practicing exactly one category.

Key decisions:
- **Default = Unanswered** (always one active, no ambiguous empty state)
- **No "All" option** — not a real study intent; nobody sits down thinking "give me a random mix of everything"
- **No "Correct" filter now** — add as a fourth segment later when reset-question-bank feature is built
- **Rename "Marked" → "Bookmarked"** — matches the "Bookmark" action button and "Bookmarks" nav link
- **Flatten into one dimension** — Bookmarked becomes a peer segment rather than a separate toggle row; the dedicated `/app/bookmarks` page serves users who need cross-filtered bookmark access
- **URL params change** from multi-value (`?status=unanswered,incorrect,marked`) to single-value (`?status=unanswered`)
- **Remove hint text** "Leave empty to include all questions" — no longer needed when something is always selected
- **Quick Practice: move control below page heading** — currently sits above the title, making it feel like a site-level control
- **Difficulty on Practice page** also converts to segmented control for visual consistency, but keeps an "All" default since mixing difficulties IS a valid study intent: `[ All | Easy | Medium | Hard ]`

Why segmented control over other patterns:
- The Tutor/Exam mode picker already teaches this interaction pattern on the same page — zero new learning
- Canonical single-select-from-few-options component (Apple, Material Design)
- Always-one-active behavior means the system is never in an ambiguous state
- Eliminates the "ghost default" asymmetry problem where Unanswered as plain text looks different from interactive chips

## Other Approaches Considered (Rejected)

### A — "Ghost default" with two toggleable chips
Unanswered as static text, Incorrect and Bookmarked as two clickable chips. Click one to switch, click again to return to default. **Rejected:** the visual asymmetry between plain text and interactive chips is confusing — a new user won't understand that "Unanswered" is the active state since it doesn't look like the other two. Needs extra label ("Showing: Unanswered") to communicate state.

### B — Segmented control + separate bookmark toggle (two rows)
Row 1 — Progress: `[ Unanswered | Incorrect | Correct ]` (segmented control). Row 2 — `☐ Bookmarked only` (toggle). Most correct data model — separates orthogonal dimensions. **Rejected:** over-engineered for this product. The cross-filter use case ("incorrect AND bookmarked") is a power-user edge case. The dedicated Bookmarks page already serves bookmark-focused study. Two control rows for a simple filter adds visual weight without proportional value.

### C — Dropdown/select menu
`Filter by: Unanswered ▾` that opens to show three options. **Rejected:** hides options behind a click. For only three values, a dropdown adds friction and obscures the other modes. Dropdowns are for 5+ options.

### D — Three chips, single-select, Unanswered pre-selected
Same visual as current chips but enforce single-select. **Rejected:** chips/pills are conventionally multi-select (tag filters on e-commerce sites). Even with single-select enforcement, the visual form factor creates a learned expectation of multi-select. Also looks identical to a segmented control without the container — so just use a proper segmented control.

### E — Multi-select with clarity hints
Keep current OR logic, add "Matches any selected status" hint. **Rejected:** the fundamental confusion is mixing mutually exclusive progress states with orthogonal bookmark state — a hint doesn't fix that.

### F — Explicit "All" chip
**Rejected:** "All" is not a study intent. Nobody sits down to practice thinking "give me a random mix of stuff I've never seen, stuff I got wrong, AND stuff I already nailed." It's a holdover from generic faceted search thinking that doesn't apply to a study tool.

## Open Questions (Resolved)

1. **Right UI pattern?** → **Segmented control.** Inherently single-select, already used for Tutor/Exam mode on the same page, canonical component for 2–5 mutually exclusive options.
2. **How do UWorld/AMBOSS/BoardVitals handle it?** → They separate progress (checkboxes: Unused/Incorrect/Correct) from bookmarks (separate toggle or dedicated list). We're going simpler: flatten into one dimension with Bookmarked as a peer segment.
3. **Should Bookmarked be separate?** → **No.** The data model is orthogonal, but the UI complexity of two control rows isn't justified. The dedicated Bookmarks page handles cross-filtered access.
4. **What does clicking Bookmarked mean?** → **Only bookmarked questions**, regardless of progress state. No cross-filtering.
5. **Standalone spec?** → **Yes.** DOM structure changes, URL param scheme changes, query logic changes, new component wiring, accessibility markup — this is a real spec.

## Bugs Found During Live Inspection

These were discovered during a UX audit of the current implementation on 2026-02-13. All are resolved naturally by the segmented control redesign.

### Bug 1: "Marked" chip renders differently on Quick Practice
On `/app/practice/quick`, the "Marked" chip has near-white text (`rgb(237, 237, 237)`) and a lighter background (`rgb(28, 28, 28)`) compared to Unanswered/Incorrect which have muted gray text (`rgb(115, 115, 115)`) and near-black background (`rgb(9, 9, 9)`). All three share identical CSS classes — this is a CSS variable resolution bug, not intentional. On `/app/practice`, all three render identically. Effect: "Marked" looks semi-selected even when `aria-pressed="false"`.

### Bug 2: Missing hint text on Quick Practice
The Practice page shows "Leave empty to include all questions" below the chips. Quick Practice shows nothing. Same component, inconsistent behavior.

### Bug 3: Vocabulary mismatch
Three different words for one concept: "Marked" (filter chip), "Bookmark" (action button), "Bookmarks" (nav link). Normalize: label = "Bookmarked", verb = "Bookmark", nav = "Bookmarks".

### Bug 4: Filter placement above page title on Quick Practice
The status chips sit above the "Quick Practice" heading, making them feel like a site-level control rather than a filter for the question stream below.

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | Captured as BS-013 for future UX polish | Not a blocker; implementation is correct but UX is confusing. Defer until active specs are complete. |
| 2026-02-13 | Single-select segmented control, 3 segments: Unanswered (default) / Incorrect / Bookmarked | Segmented control is inherently single-select (eliminates OR/AND confusion), reuses existing Tutor/Exam component pattern, always-one-active eliminates empty-state ambiguity |
| 2026-02-13 | Flatten Bookmarked into same dimension as progress states | Two-row layout (progress + bookmark toggle) is over-engineered; `/app/bookmarks` page already serves cross-filtered bookmark access |
| 2026-02-13 | Kill "All" option permanently | "All" is not a study intent — nobody deliberately practices a random mix of all statuses. Not needed for default (Unanswered covers it) |
| 2026-02-13 | Defer "Correct" segment until reset-question-bank feature | Reinforcement review is a real use case but niche; add as 4th segment when there's demand |
| 2026-02-13 | Rename "Marked" → "Bookmarked" app-wide | Vocabulary normalization: matches "Bookmark" (action verb) and "Bookmarks" (nav link) |
| 2026-02-13 | Convert Difficulty to segmented control too, with "All" default | Consistency with Status control; mixing difficulties IS a valid study intent, so "All" is warranted here |
| 2026-02-13 | Needs standalone spec (SPEC-028) | DOM structure, URL params, query logic, component wiring, a11y markup all change — not a CSS tweak |
