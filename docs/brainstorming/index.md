# Brainstorming Register

**Project:** Naltrexone University
**Last Updated:** 2026-02-12

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

| Priority | ID | Title | Status | Depends On | Related Spec |
|----------|----|-------|--------|------------|--------------|
| **P1** | [BS-012](./bs-012-question-status-filter.md) | Question Status Filter for Practice & Quick Practice | Active | — | [SPEC-024](../specs/spec-024-question-status-filter.md) |
| **P2** | [BS-011](./bs-011-history-review-wiring-and-choice-label-desync.md) Bug B | Choice Label Desync (standalone question page) | Active | — | [SPEC-025](../specs/spec-025-choice-label-desync-fix.md) |
| **P3** | [BS-011](./bs-011-history-review-wiring-and-choice-label-desync.md) Bug A | History Tab Review Wiring (review-only + reattempt path) | Active | BS-012 | [SPEC-026](../specs/spec-026-history-review-only.md) |
| **P4** | [BS-009](./bs-009-session-review-navigation-gap.md) | Session Review Navigation Gap (sessionId + prev/next) | Active | — | [SPEC-027](../specs/spec-027-session-review-navigation.md) |
| **P5** | [BS-010](./bs-010-review-mode-attempt-identity-gap.md) | Review Mode Attempt Identity Gap (attemptId) | Active | BS-009 | [SPEC-027](../specs/spec-027-session-review-navigation.md) |

> **Execution order rationale:** BS-012 is foundational — it provides the reattempt path through Practice, which unblocks making History review-only (BS-011 Bug A). BS-011 Bug B is an independent bug fix. BS-009 and BS-010 both extend `toQuestionRoute()` with URL params and could be combined into one spec; BS-010 depends on BS-009's `sessionId` infrastructure.

**Next Brainstorming ID:** BS-013

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
