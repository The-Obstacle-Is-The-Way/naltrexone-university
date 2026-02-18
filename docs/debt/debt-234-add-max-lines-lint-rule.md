# DEBT-234: Add max-lines Lint Rule to Prevent File Size Regression

**Status:** Open
**Priority:** P4
**Date:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** Biome / lint configuration

---

## Description

The 300-line production file guideline has no automated enforcement. Files that were brought under cap (e.g., `drizzle-attempt-repository.ts` was 298 after DEBT-193, grew back to 438) regress silently because there is no lint rule to flag them.

DEBT-224 identified this as a recurring pattern: debt gets resolved, then files grow back without anyone noticing until the next manual audit.

## Impact

- Manual audits are expensive and infrequent
- Developers don't know they've crossed the threshold until a debt ticket is filed
- Regression happens silently over weeks/months

## Resolution

Add a `max-lines` rule (or equivalent) to the project's lint configuration:

1. **Research:** Check if Biome supports `max-lines` natively, or if an ESLint plugin is needed
2. **Configure:** Set threshold at 350 lines (soft warning) for production files
3. **Exempt known deep modules:** `db/schema.ts`, justified Disposition A files (see DEBT-233)
4. **Exempt test files:** Test files have no hard cap per project conventions
5. **Exempt scripts:** `scripts/` directory is dev tooling

If Biome doesn't support `max-lines`, consider:
- A simple CI script that checks `wc -l` on production files
- A pre-commit hook that warns on files over 350 lines

## Verification

- [ ] Lint rule or CI check in place
- [ ] Known deep modules are exempted
- [ ] Test files and scripts are exempted
- [ ] Violations produce warnings (not errors) to allow deliberate exceptions
- [ ] `pnpm lint` still passes on current codebase

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-233](debt-233-add-why-comments-to-justified-large-files.md) — WHY comments for exempted files
- [DEBT-193](../_archive/debt/debt-193-backend-production-files-over-300-lines.md) — Original 300-line guideline
