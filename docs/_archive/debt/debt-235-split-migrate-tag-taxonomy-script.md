# DEBT-235: Split migrate-tag-taxonomy.ts Into Focused Modules

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-19
**Resolved:** 2026-02-19
**Component:** `scripts/migrate-tag-taxonomy.ts`
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)

---

## Description

`scripts/migrate-tag-taxonomy.ts` was 571 lines and conflated four distinct concerns:

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

| Module | Responsibility | Final Lines |
|--------|---------------|------------:|
| `scripts/migrate-tag-taxonomy/tag-taxonomy-mappers.ts` | Mapping tables and functions (`inferDomainTopicSlug`, `mapLegacyTopicSlug`, `canonicalXxxName`) | 189 |
| `scripts/migrate-tag-taxonomy/tag-migration-logic.ts` | Core migration algorithm (`migrateQuestionTags`, `validateInvariants`) | 123 |
| `scripts/migrate-tag-taxonomy/tag-parsers.ts` | `parseTags`, `parseChoiceTexts`, `tagsSignature` | 79 |
| `scripts/migrate-tag-taxonomy/types.ts` | Shared migration/CLI/report types | 45 |
| `scripts/migrate-tag-taxonomy.ts` | Thin CLI entry point — argument parsing, file orchestration, reporting | 182 |

Follow the same pattern used in DEBT-230 (`scripts/seed/` decomposition).

## Verification

- [x] All existing `scripts/migrate-tag-taxonomy.test.ts` tests pass unchanged
- [x] No file in the module exceeds 300 lines
- [x] CLI behavior is identical (dry-run, write, report)
- [x] Core mapping functions are independently importable and testable

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
- [DEBT-230](debt-230-decompose-seed-script-into-modules.md) — Precedent: seed.ts decomposition
