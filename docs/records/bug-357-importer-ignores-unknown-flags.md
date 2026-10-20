# BUG-357: The Draft Importer Ignores Unknown Flags

**Status:** In Progress — fix implemented; full gate and promotion pending
**Priority:** P3
**Date:** 2026-10-18

---

The Summary, Evidence and Impact describe audit baseline `0680cb2d`, before this fix; Resolution describes the implementation in this PR.

## Summary

The draft importer recognizes flags by searching the argument array, but never rejects the remaining arguments. A typo in `--dry-run` turns a requested preview into a write when the output directory is empty or absent.

## Evidence

- `scripts/import-draft-questions.ts:13-53` checks only recognized flags; `:46` enables dry-run only for the exact spelling.
- `:163-172` writes when `dryRun` is false. The empty-output check at `:90-104` protects an existing nonempty corpus, but does not prevent new unintended files.
- Reproduced with one synthetic `recall.md` using the valid fixture shape in `scripts/import-draft-questions.test.ts:15-46`, input and output under a temporary directory: `node --import tsx scripts/import-draft-questions.ts --in <input> --out <empty-output> --dry-run` exited 0 with `files=1 questions=1 written=0 (dry-run) uniqueQids=1` and no output files. Changing only the last argument to `--dry-rnu` exited 0 with `written=1` and created `misc/fixture-source/audit-001.mdx`.

## Impact

An operator can unintentionally materialize drafts. Without `--out`, the output is `content/questions/imported/` (`:21`), which is gitignored and absent in a fresh clone, so a mistyped preview writes into the tree `pnpm db:seed` reads. The command itself opens no database, and a nonempty output directory still fails closed.

Corrected 2026-10-19: the default output is the seed's input tree, the environment seeds send the leading `--`, and the typo creates unintended files without deleting existing content.

## Options

1. Consume every argument with explicit supported flags and reject unknown, duplicate or missing-value arguments before filesystem work. Preserve the leading pnpm `--` separator, which the guide documents and the environment seeds send (`seed-environment-runtime.ts:55`).
2. Keep permissive parsing and warn in the guide. This leaves unintended writes possible in an empty output tree.

## Resolution

Implemented option 1. The importer consumes every argument and rejects unknown, positional, duplicate and missing-value arguments before filesystem work. It accepts exactly one leading pnpm separator. Subprocess tests use synthetic temporary input and inspect the output tree for unintended writes.

Corrected 2026-10-19: bind reproduction claims to the audited baseline and record the red-first implementation, passing local gate and remaining final-sync verification.

## Verification

- [x] A typo and each unsupported argument exit nonzero and create no output, red first.
- [x] The supported flags, default write behavior, explicit dry-run and leading pnpm separator remain covered, including the environment seeds' `pnpm content:import:drafts -- --status published --out <staging>` call.

The local six-lane gate passed. Final validation after #1559/dev integration, coordinated E2E, review, CI and promotion remain pending. These shipped-code defects remain live until the records lifecycle permits closure.

## Related

- DEBT-532: the scripts audit previously embedded this defect without its own record.
