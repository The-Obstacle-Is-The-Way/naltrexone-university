# Audit Reports

**Project:** Naltrexone University
**Last Updated:** 2026-02-11
**Next ID:** AUDIT-005

---

## Purpose

Audit reports capture deep, cross-cutting evaluations of architecture, implementation quality, and system risk. They are distinct from individual bug/debt records and serve as historical snapshots for major review cycles.

## Active Audits

_No active audits._

## Archived Audits

| ID | Title | Date | Scope | Outcome |
|----|-------|------|-------|---------|
| AUDIT-001 | [Foundation Report](../_archive/audits/audit-001-foundation-report.md) | 2026-02-02 | Vertical/horizontal trace of core paths | All findings resolved |
| AUDIT-002 | [Foundation Report #2](../_archive/audits/audit-002-foundation-report-2.md) | 2026-02-07 | Six-axis deep audit (billing, practice, auth, UI, DB, code quality) | All findings resolved or invalidated |
| AUDIT-003 | [External Integrations Review](../_archive/audits/audit-003-external-integrations.md) | 2026-02-02 | Clerk, Stripe, and integration-pattern validation | All recommendations addressed |
| AUDIT-004 | [Spec Alignment Audit](../_archive/audits/audit-004-spec-alignment.md) | 2026-02-06 | Bug/debt classification alignment against SSOT | All items reclassified/resolved |

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
