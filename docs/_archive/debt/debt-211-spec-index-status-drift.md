# DEBT-211: Spec Index Status Drift — SPEC-021 and SPEC-022 Had Incorrect Status

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-11

---

## Description

`docs/specs/index.md` listed SPEC-021 and SPEC-022 as "Ready" (not yet implemented), but both specs were fully implemented and merged. The spec files themselves also had stale `**Status:** Ready` declarations.

### Incorrect Statuses Found

| Spec | Listed Status | Actual Status | Evidence |
|------|--------------|---------------|----------|
| SPEC-021 (History Page) | Ready | Implemented | All 3 phases merged (commits `4e7b4ad` through `768d7c2`); `/app/history` route live with Sessions + Questions tabs |
| SPEC-022 (Question Log) | Ready | Implemented | All 4 phases merged (commits `e4d5ccf` through `5da1575`); old `getMissedQuestions` removed from `src/`; `GetAttemptedQuestionsUseCase` wired end-to-end |

### False Positives (Not Actually Drifted)

The original filing also claimed SPEC-016 and SPEC-017 were "Implemented" but listed as "Partial." After careful audit, these two specs genuinely have remaining optional/post-MVP work items:

- **SPEC-016 (Observability):** "Partially Implemented" is correct — optional `pino-pretty` dev formatting and structured-log-to-Sentry enrichment remain
- **SPEC-017 (Rate Limiting):** "Partial (MVP done)" is correct — Redis upgrade and per-endpoint tuning are post-MVP work

### Root Cause

Spec statuses were not updated in either the spec files or `index.md` after implementation was completed and merged. This is a recurring documentation drift pattern.

## Impact

- **Documentation misleads developers** into thinking SPEC-021 and SPEC-022 still need implementation
- **Planning confusion** — "Ready" specs appear on the backlog when they're already done

## Resolution

1. Updated both spec files: `**Status:** Ready` → `**Status:** Implemented`
2. Updated `docs/specs/index.md`: moved SPEC-021 and SPEC-022 from Active to Archived table
3. Archived both spec files to `docs/_archive/specs/`
4. Fixed all cross-references (3 files)

## Verification

- Cross-referenced each spec against git history and codebase grep results
- All use cases, routes, and controllers referenced by these specs exist in `src/` and `app/`
- `getMissedQuestions` appears only in docs — zero source code consumers remain
- `getAttemptedQuestions` wired through all layers (port → repository → use case → controller → container → UI)

## Related

- SPEC-021, SPEC-022
- Commits: `4e7b4ad` through `27fb91c`
