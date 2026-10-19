# BUG-357: The Draft Importer Ignores Unknown Flags

**Status:** Open — reject unknown importer flags before I/O, red first
**Priority:** P3
**Date:** 2026-10-18

## Summary

The draft importer recognizes flags by searching the argument array, but never rejects the remaining arguments. A typo in `--dry-run` turns a requested preview into a write when the output directory is empty or absent.

## Evidence

- `scripts/import-draft-questions.ts:14-54` checks only recognized flags; `:46` enables dry-run only for the exact spelling.
- `:163-171` writes when `dryRun` is false. The empty-output check at `:90-103` protects an existing nonempty corpus, but does not prevent new unintended files.
- Reproduced with one synthetic `recall.md` using the valid fixture shape in `scripts/import-draft-questions.test.ts:15-47`, input and output under a temporary directory: `node --import tsx scripts/import-draft-questions.ts --in <input> --out <empty-output> --dry-run` exited 0 with `files=1 questions=1 written=0 (dry-run) uniqueQids=1` and no output files. Changing only the last argument to `--dry-rnu` exited 0 with `written=1` and created `misc/fixture-source/audit-001.mdx`.

## Impact

An operator can unintentionally materialize drafts. This command does not connect to a database, and a nonempty output directory still fails closed.

## Options

1. Consume every argument with explicit supported flags and reject unknown, duplicate or missing-value arguments before filesystem work. Preserve the documented leading pnpm `--` separator.
2. Keep permissive parsing and warn in the guide. This leaves a misspelled preview destructive to an empty output tree.

## Resolution (proposed)

Option 1, with subprocess tests that inspect the temporary output tree. DEBT-532 may later share parsing primitives; this fix need not wait for a folder move.

## Verification

- [ ] A typo and each unsupported argument exit nonzero and create no output, red first.
- [ ] The supported flags, default write behavior, explicit dry-run and leading pnpm separator remain covered.

## Related

- DEBT-532: the scripts audit previously embedded this defect without its own record.
