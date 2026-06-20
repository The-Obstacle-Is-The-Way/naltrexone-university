# Brainstorming Register

**Project:** Naltrexone University
**Last Updated:** 2026-06-20 (owner backlog review — re-verified the 3 Active docs against live code. All three premises still hold and none are superseded, so all stay Active: **BS-044** dark-border tiering — `dark:border-foreground/40` still on `feedback.tsx` inner cards + `notification-provider.tsx` toast shells; **BS-052** bookmark icon toggle — never built, all four surfaces still text pills, no `BookmarkToggle` component; **BS-059** action-bar grouping — Bookmark still sandwiched between nav controls, and a 7th control (`QuestionReportDialog`) has since been added. Fixed BS-059's stale `question-page-client.tsx:371-470` citation. All three are dormant aesthetic polish — parked-but-living, no design decision taken.)

---

## What are Brainstorming Docs?

Brainstorming docs capture UX audits, gap analyses, and design explorations before they mature into implementation specs. They serve as:

1. **Discovery** — Identify problems and validate them with evidence (code traces, Playwright audits)
2. **Analysis** — Root cause analysis, severity assessment, affected entry points
3. **Preparation** — Proposed fix sketches and open questions before committing to a spec

## Lifecycle

```text
Brainstorming (BS-NNN) → Spec (SPEC-NNN) → Implementation → Archive
```

- A brainstorming doc is **Active** while the problem is unresolved and no spec covers it
- Once a spec is written and implemented, the brainstorming doc is **Archived**
- Some brainstorming docs are superseded without a direct spec (e.g., a broader spec covers the concern)

## Brainstorming Index (Active)

| ID | Title | Status | Related Spec |
|----|-------|--------|--------------|
| [BS-044](./bs-044-dark-mode-border-weight-tiering.md) | Dark Mode Border Weight Tiering — major slices were already consumed by later PRs (`DEBT-280`, `DEBT-289`, `DEBT-301`, `DEBT-302`, `DEBT-307`, `DEBT-312/313/314`); remaining open question is whether read-only cards and subordinate inner borders still need softer dark-mode treatment | Active | [DEBT-279](../_archive/debt/debt-279-wcag-aa-contrast-remediation-plan.md) |
| [BS-052](./bs-052-bookmark-icon-toggle-replacement.md) | Bookmark Icon Toggle — no icon-toggle UI has shipped; production still uses text bookmark pills on the Bookmarks page, tutor/quick-practice action bar, post-exam review, and review/session-review action bars | Active | [BS-051](../_archive/brainstorming/bs-051-bookmark-pill-hover-pattern-investigation.md) |
| [BS-059](./bs-059-practice-session-action-bar-button-arrangement.md) | Standalone `question-page-client.tsx` action bar still has unresolved multi-state grouping questions; Direction C continuity work was split out, so this doc now owns only the still-undecided standalone layout contract | Active | [DEBT-330](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md) |
**Next Brainstorming ID:** BS-064

---

## Archived Brainstorming

| ID | Title | Outcome |
|----|-------|---------|
| [BS-063](../_archive/brainstorming/bs-063-exam-review-reentry-state-confusion.md) | Exam Review Re-Entry State Confusion — untargeted `Review Answers` re-entry from Session Summary reuses the last-viewed question, making the same surface reopen with different visible button states | Archived 2026-04-17. Fully promoted to [DEBT-364](../_archive/debt/debt-364-post-exam-review-reentry-cursor-persistence.md) after independent code trace confirmed the cursor-persistence root cause; DEBT-364 resolved 2026-04-21 via PR #282. |
| [BS-061](../_archive/brainstorming/bs-061-review-surface-divergence-audit.md) | Review Surface Divergence Audit — three different "Review Your Answers" experiences across exam-flow surfaces | Archived 2026-04-17. Fully decomposed and shipped: Direction C → DEBT-350, Direction E → DEBT-351, Direction D7 → DEBT-352 (all archived). Direction A remains tracked in [BS-059](./bs-059-practice-session-action-bar-button-arrangement.md). |
| [BS-062](../_archive/brainstorming/bs-062-sentry-seven-issue-triage-2026-04-09.md) | Sentry Seven-Issue Triage — report-only CSP telemetry vs real Clerk render bug | Completed 2026-04-09. Live Sentry/API/code re-triage separated 5 monitor-only CSP issues, 1 in-app-browser quirk, and 1 real preview Clerk-provider bug promoted to [BUG-234](../bugs/bug-234-auth-nav-user-button-missing-clerk-provider.md). |
| [BS-060](../_archive/brainstorming/bs-060-sentry-error-triage-and-environment-hygiene.md) | Sentry Error Triage and Environment Hygiene — alert rule scoped to production, localhost filter enabled, preview-only Vercel Toolbar CSP support and `sentry_environment` tagging added | Implemented 2026-03-24 in PR #250. Post-deploy verification tracked in GitHub issue #251. |
| [BS-058](../_archive/brainstorming/bs-058-exam-post-submit-flow-reorder.md) | Exam Post-Submit Flow Reorder — summary-first post-submit exam flow created a "summary sandwich" and delayed question-level learning behind an extra click | Implemented 2026-03-19 in PR #236. Core post-exam review stage shipped; residual post-ship follow-ups are tracked separately in DEBT-325, DEBT-326, and DEBT-329. |
| [BS-057](../_archive/brainstorming/bs-057-agent-browser-clerk-auth-reliability.md) | Agent-Browser Clerk Auth Reliability | Resolved 2026-03-18. Known limitation permanently documented in `docs/tooling/agent-browser.md`. `--profile` is the verified working path. |
| [BS-055](../_archive/brainstorming/bs-055-exam-session-interaction-model-rethink.md) | Exam Session Interaction Model — Submit redundancy, button bar inconsistency, click count per question | Resolved 2026-03-19. Implemented via DEBT-321 (full overhaul, 8 stages) and DEBT-322 (UX polish, PR #235). Interaction contracts documented in `docs/practice-engine/interaction-contracts.md`. |
| [BS-053](../_archive/brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md) | Bookmark vs Mark-for-Review Collision | Implemented 2026-03-16. Collision resolved; decision record preserved. |
| [BS-014](../_archive/brainstorming/bs-014-practice-starter-question-count-ux.md) | Practice Starter — Question Count UX Polish | Core fix shipped (GitHub #82). 4 optional polish decisions remain documented if future tuning desired. |
| [BS-056](../_archive/brainstorming/bs-056-magic-numbers-and-hardcoded-literals-audit.md) | Magic Numbers and Hard-Coded Literals — retry config, timeout tiers, semantic `100` owners, HTTP status constants, shared stack/prune constants, canonical time primitives, and local UI timing defaults | Resolved on 2026-03-17 in `debt/magic-numbers-audit`. All F1-F8 were implemented, and `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:browser`, and `pnpm build` passed before archival. |
| [BS-054](../_archive/brainstorming/bs-054-session-end-ux-simplification.md) | Session End UX -- Button Simplification and Ended-Session Reopen Bugs | Resolved by PR #229 on 2026-03-17. Session summaries now use the simplified CTA set, ended-session URLs bootstrap directly into durable summaries, stale double-end flows recover idempotently, and the verification matrix in BS-054 passed before archival. |
| [BS-051](../_archive/brainstorming/bs-051-bookmark-pill-hover-pattern-investigation.md) | Bookmark Pill Hover Pattern Investigation | Reference doc for BS-050; primary value consumed by DEBT-309 (PR #209). Icon replacement tracked in BS-052. |
| [BS-050](../_archive/brainstorming/bs-050-practice-chip-hover-affordance.md) | Practice Chip Hover Affordance | Promoted to [DEBT-309](../_archive/debt/debt-309-filter-chip-hover-border-affordance.md), resolved by PR #209. Hover border affordance and fill lift implemented on FilterChip. |
| [BS-049](../_archive/brainstorming/bs-049-bookmarks-card-visual-unification.md) | Bookmarks Card Visual Unification — bordered bookmark cards are visually dated next to History Questions and Dashboard tonal rows; redundant `Review` button, title underline, and heavier card chrome needed a settled implementation contract | Resolved by [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md) on 2026-03-12. Bookmarks now use page-background tonal rows with delegated pointer activation, outline `Remove`, and no attempt-result metadata expansion in this pass. |
| [BS-048](../_archive/brainstorming/bs-048-history-row-fill-depth-and-hover-policy.md) | History Row Fill Depth, Hover Policy, and Affordance Cleanup — `bg-foreground/5` on page background is perceptually darker than Dashboard/Practice rows on `bg-card`; hover and underlines redundant with chevron; Questions "Review" pill redundant with row Link | Promoted to [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md), resolved 2026-03-10. Parent-aware foreground-ramp tokens were implemented (`/[0.08]` rest on page, `hover:bg-foreground/[0.12]` for navigation rows), and redundant History affordances were removed. |
| [BS-046](../_archive/brainstorming/bs-046-filter-chip-fill-depth-and-summary-hover.md) | Filter Chip Fill Depth + Summary Hover Removal — chips are `bg-transparent` and look flat against container; summary hover is redundant with chevron and visually distracting | Promoted to [DEBT-294](../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md). Chrome visual audit added `cursor-pointer` fix and revised hover to `/[0.10]` (Radix-aligned). |
| [BS-047](../_archive/brainstorming/bs-047-history-sessions-tab-visual-unification.md) | History Page Visual Unification — bordered rows, outline buttons, heavy separators, and question card borders+shadows are visually dated vs. dashboard/practice tonal fill + chevron patterns (both tabs) | Promoted to [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md), resolved 2026-03-10. Gaps were converted into an implementation-ready History visual unification spec covering both Sessions and Questions tabs, with Gap 3 (`no wrapping Card`) explicitly decided as out of scope. |
| [BS-045](../_archive/brainstorming/bs-045-choice-button-dark-mode-fill-and-border-refinement.md) | Choice Button Dark Mode Fill and Border Refinement — gray rest fill, heavy border, indistinguishable states | Resolved by [DEBT-280](../_archive/debt/debt-280-choice-button-dark-mode-surface-refinement.md) (PR #175). Approach A implemented: rest fill removed, hover/selected steps widened, segmented control border softened. |
| [BS-043](../_archive/brainstorming/bs-043-question-flow-typography-and-feedback-visual-unification.md) | Question Flow Typography and Feedback Visual Unification — text size mismatch and badge treatment divergence between choice buttons and feedback cards | Promoted to [DEBT-282](../_archive/debt/debt-282-feedback-visual-unification.md). Resolved by PR #179. Option B implemented: feedback badges, typography, layout, and hierarchy unified with choice buttons. |
| [BS-042](../_archive/brainstorming/bs-042-contrast-consistency-and-wcag-compliance-audit.md) | Contrast Consistency and WCAG Compliance Audit | Resolved by [DEBT-279](../_archive/debt/debt-279-wcag-aa-contrast-remediation-plan.md) (PR #174). All 9 baseline violations addressed: V1-V3, V5-V9 resolved; V4 deferred (low impact). Residual aesthetic tiering tracked in [BS-044](./bs-044-dark-mode-border-weight-tiering.md). |
| [BS-041](../_archive/brainstorming/bs-041-feedback-display-content-vs-code-separation.md) | Feedback Display — Content vs Code Separation (3 problems: redundant choice text, clinical pearl spacing, section visual hierarchy) | Part B (P3 visual hierarchy) resolved by [DEBT-276](../_archive/debt/debt-276-feedback-section-card-containment.md) (PR #172). Part A (P1, P2) content-layer fixes are now tracked in [DEBT-336](../debt/debt-336-content-markdown-quality-pass.md) (C2, C3). |
| [BS-033](../_archive/brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) | Question Display Formatting and Feedback UX — 22 Problems across question display and feedback rendering | All 22 component-layer fixes complete (BUG-152–159, PRs #141–#143). Residual items were decomposed into [DEBT-335](../_archive/debt/debt-335-remove-all-or-nothing-wrong-answer-guard.md) (resolved 2026-03-24), [DEBT-336](../debt/debt-336-content-markdown-quality-pass.md), and [DEBT-337](../debt/debt-337-future-feedback-enhancements.md). |
| [BS-040](../_archive/brainstorming/bs-040-incorrect-answer-feedback-flow-redesign.md) | Incorrect Answer Feedback Flow Redesign — section ordering is identical for correct/incorrect, burying the user's mistake explanation | Promoted to [DEBT-274](../_archive/debt/debt-274-incorrect-answer-feedback-flow-reorder.md). Implemented in PR #171. |
| [BS-039](../_archive/brainstorming/bs-039-choice-button-surface-hierarchy-and-hover-ux.md) | Choice Button Surface Hierarchy and Hover UX — inverted dark-mode layering in QuestionCard | Promoted to [DEBT-273](../_archive/debt/debt-273-choice-button-surface-hierarchy-fix.md). Implemented in PR #170. |
| [BS-038](../_archive/brainstorming/bs-038-quick-practice-question-ordering-not-randomized.md) | Practice Engine Question Ordering Audit — Quick Practice not shuffled; DB insertion order leaks into `executeForFilters` | Promoted to [DEBT-268](../_archive/debt/debt-268-quick-practice-ordering-policy-alignment.md). Ordering policy codified in [ordering-policy.md](../practice-engine/ordering-policy.md). |
| [BS-037](../_archive/brainstorming/bs-037-navigation-button-ux-audit.md) | Navigation Button UX Audit — Arrow symbols, disabled-vs-hidden at boundaries, Back link styling | Fully resolved. All arrow glyphs removed from nav labels (4 source files), boundary controls changed from disabled to hidden with `<span />` spacers (PR #158). 11 deep tracers verified across all modes. |
| [BS-036](../_archive/brainstorming/bs-036-history-breakdown-ux-redesign.md) | History Page Breakdown UX Redesign — flat disclosure, list structure, a11y wiring, interaction semantics cleanup | Fully resolved by DEBT-265 (2026-03-01). Implemented across history sessions + shared breakdown list with unit/browser coverage and full pre-PR gate green. |
| [BS-035](../_archive/brainstorming/bs-035-card-hover-and-gray-consistency-audit.md) | Card Hover and Gray Consistency Audit — hover opacity chaos, expanded breakdown hierarchy, dark mode override violations | Fully resolved. Promoted to DEBT-250 (31 items, 13 decisions). All items completed across DEBT-251–264 (PRs #149–#153). FE-055 `aria-controls` wiring resolved in PR #155. |
| [BS-034](../_archive/brainstorming/bs-034-history-questions-tab-review-navigator-mismatch.md) | History Questions Tab — Ad-Hoc Questions Incorrectly Grouped into Question Navigator | Fully resolved. Core bug fixed as BUG-152 (PR #141). Residual label fixed as BUG-153 (PR #143). Position A (ad-hoc only) decided and implemented |
| [BS-032](../_archive/brainstorming/bs-032-stripe-checkout-clerk-session-friction.md) | Stripe Checkout → Clerk Session Friction — Post-Payment Auth Bounce | Promoted to DEBT-249; core auth-boundary hardening implemented, rollout instrumentation tracked in SPEC-016 |
| [BS-031](../_archive/brainstorming/bs-031-card-row-affordance-consistency.md) | Card/Row Affordance Consistency — Interaction Pattern Audit | Resolved as BUG-151 |
| [BS-001](../_archive/brainstorming/bs-001-practice-ux-audit.md) | Practice UX Audit (8 Problems) | All 8 problems resolved; led to SPEC-019 |
| [BS-002](../_archive/brainstorming/bs-002-practice-engine-state-audit.md) | Practice Engine State Audit | All critical findings fixed; informed SPEC-020 |
| [BS-003](../_archive/brainstorming/bs-003-session-view-layout-audit.md) | Session View Layout Audit | All 5 layout problems resolved |
| [BS-004](../_archive/brainstorming/bs-004-review-page-flow-audit.md) | Review Page Flow Audit | Fully resolved by SPEC-021 |
| [BS-005](../_archive/brainstorming/bs-005-practice-recent-sessions-v2.md) | Practice Recent Sessions v2 | Superseded by SPEC-021 (panel removed) |
| [BS-006](../_archive/brainstorming/bs-006-review-consistency-audit.md) | Review Consistency Audit | Resolved by SPEC-021; follow-up enhancements deferred |
| [BS-007](../_archive/brainstorming/bs-007-quick-practice-history-gap.md) | Quick Practice History Gap | Specced as SPEC-022 (implemented) |
| [BS-008](../_archive/brainstorming/bs-008-question-review-mode-gap.md) | Question Review Mode Gap | Specced as SPEC-023 (PR #92 implementing) |
| [BS-009](../_archive/brainstorming/bs-009-session-review-navigation-gap.md) | Session Review Navigation Gap | Specced as SPEC-027 (Implemented) |
| [BS-010](../_archive/brainstorming/bs-010-review-mode-attempt-identity-gap.md) | Review Mode Attempt Identity Gap | Specced as SPEC-027 (Implemented) |
| [BS-011](../_archive/brainstorming/bs-011-history-review-wiring-and-choice-label-desync.md) Bug A | History Tab Review Wiring | Specced as SPEC-026 (Implemented) |
| [BS-011](../_archive/brainstorming/bs-011-history-review-wiring-and-choice-label-desync.md) Bug B | Choice Label Desync | Specced as SPEC-025 (Implemented) |
| [BS-012](../_archive/brainstorming/bs-012-question-status-filter.md) | Question Status Filter | Specced as SPEC-024 (Implemented) |
| [BS-013](../_archive/brainstorming/bs-013-status-filter-ux-confusion.md) | Status Filter UX Confusion | Resolved by SPEC-028 (Implemented) |
| [BS-015](../_archive/brainstorming/bs-015-practice-starter-available-count-display.md) | Practice Starter — Show Available Question Count | Resolved (2026-02-14); implemented directly |
| [BS-016](../_archive/brainstorming/bs-016-review-mode-question-navigator.md) | Color-Coded Question Navigator in Review Mode | Specced as SPEC-028 (Implemented) |
| [BS-017](../_archive/brainstorming/bs-017-dev-environment-resilience.md) | Dev Environment Resilience | Specced as SPEC-029 (Implemented) |
| [BS-018](../_archive/brainstorming/bs-018-question-view-ux-unification.md) | Question View UX Unification — Navigation, State, and Action Bar Consistency | Specced as SPEC-030 (Implemented). Residual label/ordering tracked in BS-019 |
| [BS-019](../_archive/brainstorming/bs-019-action-bar-label-and-ordering-consistency.md) | Action Bar Label and Ordering Consistency | Specced as SPEC-032 (Implemented). Core inconsistencies 1-5 resolved; residual items (bookmark in history, mobile layout) deferred |
| [BS-020](../_archive/brainstorming/bs-020-card-contrast-and-hover-consistency.md) | Card Contrast and Hover Consistency — Landing Page vs App | Specced as SPEC-031 (Implemented). bg-muted→bg-background + hover token fix; residual hover standardization deferred |
| [BS-021](../_archive/brainstorming/bs-021-marketing-app-shell-divergence-and-accessibility-parity.md) | Marketing/App Shell Divergence and Accessibility Parity | Specced as SPEC-031 (Implemented). All actionable items resolved: nested main, section labels, casing |
| [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md) | Unanswered Question Review Handling | Specced as SPEC-034 (Implemented). All 4 layers resolved: auto-reveal, stats consistency, block submission, exam scoring |
| [BS-023](../_archive/brainstorming/bs-023-try-again-state-consistency.md) | Try Again — State Consistency and Business Logic Gaps | Specced as SPEC-034 (Implemented). Try Again removed from session review, kept in standalone contexts |
| [BS-024](../_archive/brainstorming/bs-024-tag-taxonomy-cleanup.md) | Tag Taxonomy Cleanup — Unify Pipeline and Eliminate Drift | Specced as SPEC-033 (Implemented). All 7 problems resolved: domain removed, pipeline hardened, taxonomy canonical |
| [BS-025](../_archive/brainstorming/BS-025-reference-section-pipeline-support.md) | Reference Section Pipeline Support | Specced as SPEC-035 (Implemented). Full vertical slice: reference_md field from seed to UI |
| [BS-026](../_archive/brainstorming/bs-026-bookmark-reattempt-review-mode-consistency.md) | Bookmark Reattempt vs Review Mode Consistency | Specced as SPEC-036 (Implemented). Bookmarks aligned to review-first contract |
| [BS-027](../_archive/brainstorming/bs-027-history-tab-bar-visual-inconsistency.md) | History Tab Bar Visual Inconsistency — Pill vs Segmented Control | Resolved by SPEC-037 (Implemented). Shared style constants unify SegmentedControl and HistoryTabBar |
| [BS-028](../_archive/brainstorming/bs-028-history-session-scoring-and-navigation-gaps.md) | History Page UX Audit — Scoring, Duration, Navigation, Review Parity | Resolved by SPEC-038 (Implemented). Re-verified by Playwright audit (`17/17` passing on 2026-02-23) |
| [BS-029](../_archive/brainstorming/bs-029-clerk-user-id-email-upsert-conflict.md) | Clerk User ID / Email Upsert Conflict — Unhandled Unique Constraint | Resolved as BUG-147 (Fix C: catch-and-update for `users_email_uq` in `DrizzleUserRepository`) |
| [BS-030](../_archive/brainstorming/bs-030-proxy-middleware-layer-analysis.md) | Proxy/Middleware Layer — First-Principles Architecture Analysis | Resolved as BUG-150. Export naming mismatch removed and guarded by `proxy.test.ts` regression test |

---

## How to Create a New Brainstorming Doc

1. Create `bs-NNN-short-description.md` in `docs/brainstorming/`
2. Add entry to the Active index table above
3. When the work is specced and implemented, move to `docs/_archive/brainstorming/` and update both tables

## Brainstorming Template

```markdown
# BS-NNN: Short Title

**Date:** YYYY-MM-DD
**Triggered by:** What prompted this investigation?
**Scope:** One-sentence summary of the problem
**Related:** Links to related docs, specs, or other brainstorming

---

## The Problem

What is wrong? Include concrete scenarios.

## Root Cause Analysis

Why does this happen? Code traces, evidence.

## Severity Assessment

How bad is it? Who is affected? How often?

## Proposed Fix (Sketch)

High-level approach, not implementation details.

## Open Questions

What needs to be resolved before speccing?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
```

---

## Related Documentation

- [Implementation Specs](../specs/index.md)
- [Technical Debt](../debt/index.md)
- [Bug Reports](../bugs/index.md)
