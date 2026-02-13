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

4. **No explicit "All" option.** BS-012 proposed an "All" chip. SPEC-024 replaced it with "Leave empty to include all questions" hint text, which is less discoverable and makes "nothing selected" ambiguous — does it mean "no filter" or "I forgot to pick one"?

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

## Leading Thought

Default to unanswered. No chip for it — that's just what you get. The only selectable chips are **Incorrect** and **Marked**, single-select (one at a time). No "All" option — "All" is not descriptive enough and doesn't map to a real study intent.

```
Default (no chip active):  Unanswered questions
Click "Incorrect":         Switch to incorrect-only
Click "Marked":            Switch to marked-only
Click active chip again:   Back to default (unanswered)
```

This is the simplest mental model: you're always practicing one category of questions. No OR logic, no multi-select confusion, no ambiguous empty state.

**But this is not settled.** Something about the whole interaction still feels off. The relationship between these categories, the chip UI pattern, how to communicate the default — it needs more thought. This is an open design question, not a solved problem.

## Other Approaches Considered

### Multi-select with clarity hints
- Keep current OR logic, add "Matches any selected status" hint
- Rejected: the fundamental confusion is mixing mutually exclusive progress states with orthogonal bookmark state — a hint doesn't fix that

### Separate dimensions into two rows
- Row 1 — Progress: Unanswered | Incorrect (single-select)
- Row 2 — Bookmarked only: toggle checkbox
- Most correct data model, but may feel heavy for the UI

### Explicit "All" chip
- Rejected: "All" is not descriptive — all what? All statuses? All questions? It's a non-concept for the user.

## Open Questions

1. Is the "default = unanswered, chips = incorrect/marked" model actually the right framing, or is there a completely different UI pattern that fits better (e.g., a dropdown, a segmented control, a checkbox)?
2. How do UWorld/AMBOSS/BoardVitals handle the "Marked" filter relative to progress filters? Are they separate controls?
3. Should "Marked" even live in the same control as progress states, given it's a different dimension entirely?
4. What does the user expect when they click "Marked" — only marked questions, or marked questions filtered by their progress state?
5. Is this worth a standalone spec, or small enough to fold into a broader UX pass?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | Captured as BS-013 for future UX polish | Not a blocker; implementation is correct but UX is confusing. Defer until active specs are complete. |
