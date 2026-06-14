# Audit Reports

**Project:** Naltrexone University
**Last Updated:** 2026-06-13
**Next ID:** AUDIT-013

---

## Purpose

Audit reports capture deep, cross-cutting evaluations of architecture, implementation quality, and system risk. They are distinct from individual bug/debt records and serve as historical snapshots for major review cycles.

## Active Audits

| ID | Title | Date | Scope | Outcome |
|----|-------|------|-------|---------|

## Archived Audits

| ID | Title | Date | Scope | Outcome |
|----|-------|------|-------|---------|
| AUDIT-012 | [Repository Organization, Dev Tooling & Agent Documentation](../_archive/audits/audit-012-repo-org-devx.md) | 2026-06-13 | CI/CD & dev tooling, AGENTS/CLAUDE/.claude/rules accuracy, file org vs Clean Architecture, code quality vs Clean Code + PoSD | Resolved 2026-06-13. Code/doc findings fixed, CI/security platform gaps filed as BUG-248/BUG-249, stricter TS flags and residual esbuild advisories filed as DEBT-418/DEBT-419. |
| AUDIT-011 | [Error Observability & Defensive Coding Sweep](../_archive/audits/audit-011-error-observability-defensive-coding.md) | 2026-03-07 | Error handling, type safety, array access, concurrency | Resolved 2026-03-19. BUG-201, BUG-202 resolved; BUG-199 invalidated; DEBT-286 resolved (PR #218). |
| AUDIT-010 | Exam Secrecy and Cross-Layer Invariant Sweep | 2026-03-02 | Exam-answer secrecy invariant enforcement across use cases, controllers, projections, retry/review | Resolved 2026-03-19. All 6 bugs (BUG-180–185) resolved and archived. |
| AUDIT-009 | Bug Hunt #9 | 2026-03-02 | General sweep | 0 bugs found; reverted as cruft |
| AUDIT-008 | [Deep Codebase Sweep](../_archive/audits/audit-008-deep-codebase-sweep.md) | 2026-03-02 | Full-stack sweep (12 bugs: BUG-167–179) | All findings resolved and archived |
| AUDIT-007 | Deep Sweep for First-Principles, Silent-Drop, and Relative Bugs (inline in [bugs/index.md](../bugs/index.md)) | 2026-02-27 | Five-axis investigation with parallel agents | 2 bugs filed (BUG-165, BUG-166), both resolved |
| AUDIT-006 | Full-Stack Bug Sweep with 5 Parallel Agents (inline in [bugs/index.md](../bugs/index.md)) | 2026-02-25 | Five-axis sweep (architecture, tests, APIs, UI, docs) | 3 bugs filed (BUG-160–162), all resolved |
| AUDIT-005 | Six-Axis Codebase Bug Sweep (inline in [bugs/index.md](../bugs/index.md)) | 2026-02-22 | Domain logic, adapters, frontend, wiring, security, docs | 2 bugs filed (BUG-148, BUG-149), both resolved |
| AUDIT-004 | [Spec Alignment Audit](../_archive/audits/audit-004-spec-alignment.md) | 2026-02-06 | Bug/debt classification alignment against SSOT | All items reclassified/resolved |
| AUDIT-003 | [External Integrations Review](../_archive/audits/audit-003-external-integrations.md) | 2026-02-02 | Clerk, Stripe, and integration-pattern validation | All recommendations addressed |
| AUDIT-002 | [Foundation Report #2](../_archive/audits/audit-002-foundation-report-2.md) | 2026-02-07 | Six-axis deep audit (billing, practice, auth, UI, DB, code quality) | All findings resolved or invalidated |
| AUDIT-001 | [Foundation Report](../_archive/audits/audit-001-foundation-report.md) | 2026-02-02 | Vertical/horizontal trace of core paths | All findings resolved |

## Lifecycle

1. **Trigger** — Major milestone, pre-sprint review, or risk concern.
2. **Execute** — Dedicated agents audit scope; findings become BUGs/DEBTs.
3. **Resolve** — All actionable findings tracked and closed.
4. **Archive** — Completed audit moves to `docs/_archive/audits/`.

## Notes

- Actionable defects from audits should be tracked in [`docs/bugs/index.md`](../bugs/index.md) and [`docs/debt/index.md`](../debt/index.md).
- Archived audits remain accessible for traceability.

## Related

- [Specs Index](../specs/index.md)
- [Brainstorming Index](../brainstorming/index.md)
- [Bugs Index](../bugs/index.md)
- [Debt Index](../debt/index.md)
