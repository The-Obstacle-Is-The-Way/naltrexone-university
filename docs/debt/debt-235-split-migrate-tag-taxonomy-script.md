# DEBT-235: Split migrate-tag-taxonomy.ts Into Focused Modules

**Status:** Open
**Priority:** P3
**Date:** 2026-02-19
**Component:** `scripts/migrate-tag-taxonomy.ts`
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)

---

## Description

`scripts/migrate-tag-taxonomy.ts` is 571 lines and conflates four distinct concerns:

1. **CLI argument parsing** — flag handling, help text, dry-run mode
2. **Tag transformation logic** — mapping legacy taxonomy to canonical taxonomy (pure functions)
3. **Parsing/validation** — extracting tags from MDX frontmatter, validating invariants
4. **File I/O orchestration** — scanning directories, reading/writing files, reporting results

This violates single responsibility and makes the core migration logic harder to test in isolation.

## Impact

- Core tag-mapping logic cannot be unit-tested without file I/O
- CLI concerns are coupled to business logic
- Future taxonomy changes require touching a 571-line file
- The transformation functions are reusable but locked inside a monolithic script

## Resolution

Split into focused modules under `scripts/migrate-tag-taxonomy/`:

| Module | Responsibility | Estimated Lines |
|--------|---------------|----------------|
| `tag-taxonomy-mappers.ts` | Mapping tables and functions (`inferDomainTopicSlug`, `mapLegacyTopicSlug`, `canonicalXxxName`) | ~80 |
| `tag-migration-logic.ts` | Core migration algorithm (`migrateQuestionTags`, `validateInvariants`) | ~120 |
| `tag-parsers.ts` | `parseTags`, `parseChoiceTexts`, `tagsSignature` | ~90 |
| `migrate-tag-taxonomy.ts` | CLI entry point — argument parsing, file orchestration, reporting | ~150 |

Follow the same pattern used in DEBT-230 (`scripts/seed/` decomposition).

## Verification

- [ ] All existing `scripts/migrate-tag-taxonomy.test.ts` tests pass unchanged
- [ ] No file in the module exceeds 300 lines
- [ ] CLI behavior is identical (dry-run, verbose, file targeting)
- [ ] Core mapping functions are independently importable and testable

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-230](../_archive/debt/debt-230-decompose-seed-script-into-modules.md) — Precedent: seed.ts decomposition
