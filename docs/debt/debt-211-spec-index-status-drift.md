# DEBT-211: Spec Index Status Drift — 4 Specs Have Incorrect Status

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-11

---

## Description

`docs/specs/index.md` lists four specs with incorrect implementation statuses. The code audits confirm these specs are further along than their listed status indicates.

### Incorrect Statuses Found

| Spec | Listed Status | Actual Status | Evidence |
|------|--------------|---------------|----------|
| SPEC-016 (Observability) | Partial | Implemented | Pino logger + Sentry fully wired; only optional `pino-pretty` deferred |
| SPEC-017 (Rate Limiting) | Partial | Implemented | Postgres-backed fixed-window limiter fully operational; Redis upgrade is post-MVP |
| SPEC-021 (History Page) | Ready | Implemented | All 3 phases merged (commits `4e7b4ad` through `768d7c2`) |
| SPEC-022 (Question Log) | Ready | Implemented | All 4 phases merged (commits `e4d5ccf` through `5da1575`); old `getMissedQuestions` already removed from `src/` |

### Root Cause

Spec statuses were not updated in `index.md` after implementation was completed and merged. This is a recurring documentation drift pattern.

## Impact

- **Documentation misleads developers** into thinking these specs still need implementation work
- **Planning confusion** — "Ready" specs appear on the backlog when they're already done

## Resolution

Updated `docs/specs/index.md` to reflect actual implementation status for all four specs.

## Verification

- Cross-referenced each spec against git history and codebase grep results
- All use cases, routes, and controllers referenced by these specs exist in `src/` and `app/`
- All 1,267 unit tests pass

## Related

- SPEC-016, SPEC-017, SPEC-021, SPEC-022
- Commits: `4e7b4ad` through `27fb91c`
