# BUG-309: Dark-Theme Small Text Fails WCAG AA Contrast (Destructive Text; Muted Text on Tonal Rows)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-09-29
**Resolved:** 2026-09-29 — promoted to `main` through #1229; production release verified (see Resolution)
**Verification receipts:** see Resolution

---

## Description

The app forces its dark theme (`forcedTheme="dark"` in `app/layout.tsx`), so the dark tokens are the only product colours. Two token pairings put small informational text below the WCAG 2.2 SC 1.4.3 minimum of 4.5:1, which `docs/frontend/contrast-policy.md` §3.1 requires for "labels, timestamps, metadata".

1. **`text-destructive` fails on every dark surface.**
   - The dark `--destructive` is `hsl(0 72% 51%)` (#dc2828). As text it measures 3.9:1 on the card (#121212), 4.15:1 on the page (#090909), and 3.5–3.6:1 on the tonal row fills.
   - Its most visible use is the answer-result label "Incorrect": History's attempted questions, the Dashboard's recent activity, and the session breakdown. There are 20 `text-destructive` sites in 16 production files.
   - For a learner reviewing their answers, the result label is primary information, not decoration.
2. **`text-muted-foreground` fails on tonal row fills inside cards.**
   - The dark `--muted-foreground` is `hsl(0 0% 51.5%)` (#838383). It passes on the card (4.9:1) and the page (5.2:1), but measures 4.44:1 on the Dashboard's `bg-foreground/5` rows (dates, "(50%)" figures).
   - The inactive History tab link (`HistoryTabBar`, a `Link` on the shared `bg-muted` container) sits on the threshold. As rendered it is 4.495:1: the browser paints the 8-bit colours #838383 on #1c1c1c, which axe reports as 4.49:1. The unrounded token values give 4.51:1.
   - WCAG compares the ratio without rounding, so the rendered value fails by a hair. It sits on `bg-muted`, not on a row fill, so a row-only fix would not clear it; see Fix.

Expected: all informational text at 4.5:1 or better on the surface it sits on.

## How it was found

The DEBT-484 part-four captures ran axe 4.10.2 on the local production build of History (questions tab) and the Dashboard at 1440×900 and 390×844 (2026-09-29, PR #1219).

- **History:** 4 `color-contrast` nodes in the detailed run: three "Incorrect" labels at 3.59:1 (`#dc2828` on `#1b1b1b`), and the inactive tab link at 4.49:1 as rendered.
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

## Fix (2026-09-29)

- **Tokens, dark theme only.**
  - `--destructive` changes from `0 72% 51%` to `0 91% 71%` (`#dc2828` to `#f87171`).
  - `--muted-foreground` changes from `0 0% 51.5%` to `0 0% 55%` (`#838383` to `#8c8c8c`).
  - A single token change for each covers every consumer, including the inactive History tab link and the Practice segmented controls on `bg-muted`.
- **Button.** The destructive variant gains `dark:hover:bg-destructive/50`. Without it, the inherited `hover:bg-destructive/90` would put white text at 3.29:1 on the lighter red. Solid fills stay at `dark:bg-destructive/60`.
- **Measured, as rendered (8-bit channels):**

| Pairing | Before | After |
| --- | --- | --- |
| `text-destructive` on its worst surface (page, card, row fills and hovers, destructive tints) | 3.24:1 | 5.56:1 |
| `text-muted-foreground` on its worst surface (row fills and hovers, `bg-muted`) | 4.09:1 | 4.62:1 |
| White text on the destructive fills at rest (`/60`) and on the dark hover (`/50`) | 9.08:1 | 5.96:1 |
| `destructive-foreground` on the destructive fills | 7.75:1 | 5.09:1 |

- **Guard.** `components/theme-dark-text-contrast.test.ts` measures these pairings on every surface the text sits on. It is red on the old tokens.
  - The contrast math moved to `components/theme-contrast-test-helpers.ts`, with its own unit test.
  - The existing token suites pin the new values.
- **Policy.** `contrast-policy.md` §3.1 records the pairings and the rule: add a surface to the suite before placing small text on a new fill. The Pattern Registry's gray stack and the page audits cite the new values.

## Verification

- [x] Token/pairing unit guard added: `components/theme-dark-text-contrast.test.ts`, red on the old tokens.
- [x] axe sweep on the local production build, Dashboard, History questions, History sessions with a breakdown open, and Practice, at 1440×900 and 390×844:
  - old tokens: 16 `color-contrast` nodes per size (Dashboard 5, History questions 2, History sessions 3, Practice 6);
  - new tokens: 0.
  - The Practice nodes were its segmented controls, which the record had not listed.
- [x] Captures before and after: [Dashboard before](../../bugs/assets/bug-309/before-dashboard-dark-1440x900.png), [Dashboard after](../../bugs/assets/bug-309/after-dashboard-dark-1440x900.png), [History before](../../bugs/assets/bug-309/before-history-questions-dark-1440x900.png), [History after](../../bugs/assets/bug-309/after-history-questions-dark-1440x900.png); mobile: [Dashboard before](../../bugs/assets/bug-309/before-dashboard-dark-390x844.png), [Dashboard after](../../bugs/assets/bug-309/after-dashboard-dark-390x844.png), [History before](../../bugs/assets/bug-309/before-history-questions-dark-390x844.png), [History after](../../bugs/assets/bug-309/after-history-questions-dark-390x844.png).
- [x] Production release verified, then the record is resolved and archived.

## Resolution (2026-09-29)

- **Shipped.** #1227 merged as `6d8072ee` with exact-head approval **5359310519** on `a1be2cfe`.
  - Its one finding was accepted: the guard's Button case now asserts the exported `buttonVariants({ variant: 'destructive' })` instead of parsing the source. Removing `dark:hover:bg-destructive/50` from the variant fails it.
  - The local full gate passed on that exact head: 6,074 unit, 448 browser and 573 integration tests; build; all 60 E2E tests; the hosted Stripe lane, 7/7.
- **Promoted and released.** Promoted through #1229 (`2a3d665f`), with #1226 and #1228. The promotion's proof was written into its body at 23:46:34Z, before the merge at 23:46:39Z; its review raised no findings.
  - Release verified: main CI **36646977307** `test` **23:59:11Z**; Ready **23:47:59.946Z**, held without alias until its check completed; production assigned **23:59:13.515Z**; matching trees `9bb54d1a`; healthy production.
  - Production's stylesheet serves the new dark tokens, `--destructive: 0 91% 71%` and `--muted-foreground: 0 0% 55%`. Before the alias moved, it served `0 72% 51%` and `0 0% 51.5%`.
