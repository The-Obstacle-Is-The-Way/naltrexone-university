# DEBT-234: Add max-lines Check to Prevent File Size Regression

**Status:** Open
**Priority:** P4
**Date:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `.husky/pre-commit` (or `.github/workflows/ci.yml` as fallback)

---

## Description

The 300-line production file guideline has no automated enforcement. Files that were brought under cap (e.g., `drizzle-attempt-repository.ts` was 298 after DEBT-193, grew back to 438) regress silently because there is no lint rule to flag them.

DEBT-224 identified this as a recurring pattern: debt gets resolved, then files grow back without anyone noticing until the next manual audit.

## Tooling Context

- **Biome 2.3.13** is the project's sole linter (no ESLint). Biome **does not** have a native `max-lines` rule as of v2.3.13.
- **Husky** pre-commit hook already exists (`.husky/pre-commit` runs `pnpm exec lint-staged`). This is the lowest-friction integration point.
- **CI** (`.github/workflows/ci.yml`) runs `pnpm lint:ci` but has no file-size checks today.

## Impact

- Manual audits are expensive and infrequent
- Developers don't know they've crossed the threshold until a debt ticket is filed
- Regression happens silently over weeks/months

## Why This Is Worth Fixing

- **Robustness gain:** early automated signals prevent silent growth regressions.
- **Complexity risk to avoid:** enforcement should be warning-level and allow explicit justified exceptions.

## Resolution

Since Biome lacks native `max-lines` support, implement a lightweight check via one of these paths (ordered by preference):

### Option A: Pre-commit hook (recommended — lowest friction)

Add a file-size check to the existing Husky pre-commit pipeline:

1. Create a `scripts/check-file-size.sh` script that runs `wc -l` on staged production `.ts`/`.tsx` files
2. Set threshold at 350 lines (soft warning, non-blocking)
3. Exempt known deep modules: `db/schema.ts` and Disposition A files documented in DEBT-233
4. Exempt test files (`*.test.ts`, `*.test.tsx`, `*.spec.tsx`, `*.browser.spec.tsx`)
5. Exempt scripts (`scripts/` directory)
6. Wire into `.husky/pre-commit` or `lint-staged` config

### Option B: CI check (fallback)

Add a step to `.github/workflows/ci.yml` that scans production files and fails with a warning if any exceed 350 lines (excluding exemptions).

Guardrail: keep the implementation transparent and low-maintenance; a simple shell script is preferable to a custom lint framework.

## Verification

- [ ] Pre-commit hook or CI check in place
- [ ] Known deep modules are exempted
- [ ] Test files and scripts are exempted
- [ ] Violations produce warnings (not errors) to allow deliberate exceptions
- [ ] `pnpm lint` still passes on current codebase
- [ ] Pre-commit hook does not noticeably slow down commits

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
- [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) - WHY comments for justified exemptions
- [DEBT-193](../_archive/debt/debt-193-backend-production-files-over-300-lines.md) - Original 300-line guideline
