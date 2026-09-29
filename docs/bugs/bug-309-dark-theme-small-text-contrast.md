# BUG-309: Dark-Theme Small Text Fails WCAG AA Contrast (Destructive Text; Muted Text on Tonal Rows)

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open
**Priority:** P2
**Date:** 2026-09-29
**Resolved:** —
**Verification receipts:** —

---

## Description

The app forces its dark theme (`forcedTheme="dark"` in `app/layout.tsx`), so the dark tokens are the only product colours. Two token pairings put small informational text below the WCAG 2.2 SC 1.4.3 minimum of 4.5:1, which `docs/frontend/contrast-policy.md` §3.1 requires for "labels, timestamps, metadata".

1. **`text-destructive` fails on every dark surface.**
   - The dark `--destructive` is `hsl(0 72% 51%)` (#dc2828). As text it measures 3.9:1 on the card (#121212), 4.15:1 on the page (#090909), and 3.5–3.6:1 on the tonal row fills.
   - Its most visible use is the answer-result label "Incorrect": History's attempted questions, the Dashboard's recent activity, and the session breakdown. There are 20 `text-destructive` sites in 16 production files.
   - For a learner reviewing their answers, the result label is primary information, not decoration.
2. **`text-muted-foreground` fails on tonal row fills inside cards.**
   - The dark `--muted-foreground` is `hsl(0 0% 51.5%)` (#838383). It passes on the card (4.9:1) and the page (5.2:1), but measures 4.44:1 on the Dashboard's `bg-foreground/5` rows (dates, "(50%)" figures).
   - The History tab's inactive trigger measures 4.49:1.

Expected: all informational text at 4.5:1 or better on the surface it sits on.

## How it was found

The DEBT-484 part-four captures ran axe 4.10.2 on the local production build of History (questions tab) and the Dashboard at 1440×900 and 390×844 (2026-09-29, PR #1219).

- **History:** 3 `color-contrast` nodes, all "Incorrect" at 3.59:1 (`#dc2828` on `#1b1b1b`), and the inactive tab trigger at 4.49:1.
- **Dashboard:** 10 nodes: "Incorrect" at 3.51:1 on `#1d1d1d`, and muted dates and percentages at 4.44:1.
- **Scope:** none involves the change under review; all predate it.

## Steps to Reproduce

1. Build and start the app locally; sign in as a learner with at least one incorrect attempt.
2. Open `/app/history?tab=questions` and `/app/dashboard`.
3. Run axe (or measure computed colours): the "Incorrect" labels and the Dashboard row metadata report `color-contrast` failures.

## Root Cause

- **Two changes, measured together for the first time.**
  - DEBT-279 (March 2026, closing BS-042) fixed the contrast failures measured then.
  - The tonal row fills added afterwards (DEBT-289, DEBT-302) raise the surface luminance behind small text. The dark destructive token was never tuned for text on dark surfaces; it serves both fills (`bg-destructive`) and text.
- **A stale policy pointer.** `contrast-policy.md` §3.1 still says "current failures are documented in BS-042", but BS-042 is archived as resolved, so nothing tracked these.

## Fix (proposed; decide in the fix PR)

- **Destructive text.**
  - Give destructive *text* its own dark value that meets 4.5:1 on the lightest surface it sits on, the row fills, while keeping `bg-destructive` fills and their foreground compliant. For example, a text token or a lighter dark `--destructive`, checked against every consumer.
  - Record the pairing in `contrast-policy.md`, and extend `theme-token-regression` to cover it.
- **Muted text on tonal rows.** Either raise the dark `--muted-foreground` enough to clear 4.5:1 on the row fills, or use a documented foreground-ramp text value on those rows. Record the pairing.
- **Policy.** Correct `contrast-policy.md` §3.1's pointer.
- **Proof.** An axe sweep of the affected pages, with receipts, before and after.

## Verification

- [ ] Token/pairing unit guard added
- [ ] axe sweep: History, Dashboard, session summary, post-exam review, bookmarks — zero `color-contrast` nodes
- [ ] Captures before and after
