# Audit Reports

**Project:** Naltrexone University
**Last Updated:** 2026-02-08

---

## Purpose

Audit reports capture deep, cross-cutting evaluations of architecture, implementation quality, and system risk. They are distinct from individual bug/debt records and serve as historical snapshots for major review cycles.

## Audit Index

| ID | Title | Date | Scope |
|----|-------|------|-------|
| AUDIT-001 | [Foundation Audit Report](foundation-audit-report.md) | 2026-02-02 | Vertical/horizontal trace of core paths |
| AUDIT-002 | [Foundation Audit Report #2](foundation-audit-report-2.md) | 2026-02-07 | Six-axis deep audit (billing, practice, auth, UI, DB, code quality) |
| AUDIT-003 | [External Integrations Review](audit-003-external-integrations.md) | 2026-02-02 | Clerk, Stripe, and integration-pattern validation |
| AUDIT-004 | [Spec Alignment Audit (2026-02-06)](spec-alignment-audit-2026-02-06.md) | 2026-02-06 | Bug/debt classification alignment against SSOT |

## Notes

- Actionable defects from audits should be tracked in `docs/bugs/index.md` and `docs/debt/index.md`.
- Completed audit findings remain in this folder for traceability.
