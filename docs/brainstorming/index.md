# Brainstorming Register

**Project:** Naltrexone University
**Last Updated:** 2026-02-13

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
| [BS-011](./bs-011-history-review-wiring-and-choice-label-desync.md) Bug B | Choice Label Desync (standalone question page) | **Active** | [SPEC-025](../_archive/specs/spec-025-choice-label-desync-fix.md) (Ready) |

**Next Brainstorming ID:** BS-014

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
| [BS-011](./bs-011-history-review-wiring-and-choice-label-desync.md) Bug A | History Tab Review Wiring | Specced as SPEC-026 (Implemented) |
| [BS-012](../_archive/brainstorming/bs-012-question-status-filter.md) | Question Status Filter | Specced as SPEC-024 (Implemented) |
| [BS-013](../_archive/brainstorming/bs-013-status-filter-ux-confusion.md) | Status Filter UX Confusion | Resolved by SPEC-028 (Implemented) |

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
