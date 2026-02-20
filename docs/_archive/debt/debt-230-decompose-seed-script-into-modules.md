# DEBT-230: Decompose seed.ts Into Focused Modules

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-18
**Resolved:** 2026-02-19
**Last Verified:** 2026-02-19
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `scripts/seed.ts`

---

## Description

`scripts/seed.ts` was reduced from **486 lines** to **58 lines** by extracting focused modules for each stage in the seed pipeline.

1. **File I/O** — glob pattern matching, reading MDX files from disk
2. **Markdown parsing** — frontmatter extraction, content validation
3. **Tag management** — canonical tag upsertion and validation
4. **Question sync** — diff computation, upsert/delete orchestration
5. **Placeholder archival** — archiving placeholder rows in the database

**Disposition:** B - Multiple responsibilities should be split.

## Impact

- Dev script, not production code — low direct user impact
- Growing steadily (+17% since audit) as content pipeline evolves
- Difficult to unit test individual stages
- New developers must read 500 lines to understand the seed process

## Why This Is Worth Fixing

- **Robustness gain:** clearer seams for parsing/sync/archival reduce regression blast radius in content pipeline changes.
- **Complexity risk to avoid:** keep orchestration flow linear in `seed.ts`; do not add framework-like indirection.

## Resolution

Resolved by extracting stages into focused modules:

```
scripts/
  seed.ts                     (58 lines — orchestrator, CLI entry point)
  seed/
    file-reader.ts            (45 lines — glob + MDX file reading)
    question-parser.ts        (115 lines — frontmatter + content parsing)
    tag-manager.ts            (114 lines — tag upsertion + tag validation)
    question-syncer.ts        (212 lines — diff + upsert orchestration)
    placeholder-archiver.ts   (18 lines — placeholder archival)
```

Keep `seed.ts` as the thin orchestrator calling each stage in sequence.

Guardrail: reuse existing `scripts/seed-helpers.ts` where appropriate instead of creating duplicate utility modules.

## Verification

- [x] Each stage extracted to its own module
- [x] `seed.ts` orchestrates stages in sequence
- [ ] `pnpm seed` still works end-to-end against local DB
- [x] Existing `scripts/seed.test.ts` passes (updated to import from `seed/tag-manager`)
- [x] `pnpm typecheck` passes

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
