# DEBT-230: Decompose seed.ts Into Focused Modules

**Status:** Open
**Priority:** P4
**Date:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `scripts/seed.ts`

---

## Description

`scripts/seed.ts` has grown to **484 lines** (up from 412 at audit time, +72 lines). It mixes five distinct concerns:

1. **File I/O** — glob pattern matching, reading MDX files from disk
2. **Markdown parsing** — frontmatter extraction, content validation
3. **Tag management** — canonical tag upsertion and validation
4. **Question sync** — diff computation, upsert/delete orchestration
5. **Placeholder archival** — moving placeholder files

**Disposition:** B — Multiple responsibilities that should be split.

## Impact

- Dev script, not production code — low direct user impact
- Growing steadily (+17% since audit) as content pipeline evolves
- Difficult to unit test individual stages
- New developers must read 500 lines to understand the seed process

## Resolution

Extract stages into focused modules:

```
scripts/
  seed.ts                     (~80 lines — orchestrator, CLI entry point)
  seed/
    file-reader.ts            (~60 lines — glob + MDX file reading)
    question-parser.ts        (~80 lines — frontmatter + content parsing)
    tag-manager.ts            (~50 lines — tag upsertion logic)
    question-syncer.ts        (~120 lines — diff + upsert orchestration)
    placeholder-archiver.ts   (~30 lines — placeholder file management)
```

Keep `seed.ts` as the thin orchestrator calling each stage in sequence.

## Verification

- [ ] Each stage extracted to its own module
- [ ] `seed.ts` orchestrates stages in sequence
- [ ] `pnpm seed` still works end-to-end against local DB
- [ ] Existing `scripts/seed.test.ts` passes (or is updated to test individual modules)
- [ ] `pnpm typecheck` passes

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
