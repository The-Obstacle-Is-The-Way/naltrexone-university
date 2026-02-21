# Brainstorming Register

**Project:** Naltrexone University
**Last Updated:** 2026-02-20

---

## What are Brainstorming Docs?

Brainstorming docs capture UX audits, gap analyses, and design explorations before they mature into implementation specs. They serve as:

1. **Discovery** — Identify problems and validate them with evidence (code traces, Playwright audits)
2. **Analysis** — Root cause analysis, severity assessment, affected entry points
3. **Preparation** — Proposed fix sketches and open questions before committing to a spec

## Lifecycle

```
Brainstorming (BS-NNN) → Spec (SPEC-NNN) → Implementation → Archive
```

- A brainstorming doc is **Active** while the problem is unresolved and no spec covers it
- Once a spec is written and implemented, the brainstorming doc is **Archived**
- Some brainstorming docs are superseded without a direct spec (e.g., a broader spec covers the concern)

## Brainstorming Index (Active)

| ID | Title | Status | Related Spec |
|----|-------|--------|--------------|
| [BS-014](./bs-014-practice-starter-question-count-ux.md) | Practice Starter — Silent Truncation When Fewer Questions Available | Active | — |
| [BS-027](./bs-027-history-tab-bar-visual-inconsistency.md) | History Tab Bar Visual Inconsistency — Pill vs Segmented Control | Active | [SPEC-037](../specs/spec-037-tab-switch-visual-unification.md) |
| [BS-028](./bs-028-history-session-scoring-and-navigation-gaps.md) | History Page UX Audit — Scoring, Duration, Navigation, Review Parity (13 findings) | Active | — |

**Next Brainstorming ID:** BS-029

---

## Archived Brainstorming

| ID | Title | Outcome |
|----|-------|---------|
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
