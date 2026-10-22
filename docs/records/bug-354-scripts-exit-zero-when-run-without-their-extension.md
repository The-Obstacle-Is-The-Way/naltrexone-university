# BUG-354: Scripts Exit 0 Without Running When Called Without Their Extension or Through a Symlink

**Status:** Verifying — promotion to main; due 2026-10-23
**Priority:** P3
**Date:** 2026-10-18

---

The Summary, Evidence and Impact describe audit baseline `0680cb2d`, before this fix; Resolution describes the implementation in this PR.

## Summary

Thirty-six entry points under `scripts/` (34 `.ts` and 2 `.mts`) decide whether to run by comparing `import.meta.url` with a file URL derived from `process.argv[1]`. A path that `tsx` resolves without `.ts`, or a symlink path, can differ from the module's resolved URL. The guard then skips the work and the script exits 0.

The merge guard and the promotion verifier are run by hand, and by agents following `AGENTS.md`. So a mistyped `pnpm exec tsx scripts/merge-reviewed-pr <PR>` prints nothing and exits 0, which a person or an agent can take for a pass.

## Evidence

- **Reproduced 2026-10-18:**
  - `pnpm exec tsx scripts/merge-reviewed-pr` exits 0 with no output. With `.ts` it exits 1 with its usage error.
  - `pnpm exec tsx scripts/next-record-id debt` exits 0 with no output. With `.ts` it prints the ID.
  - The second agent's challenge reproduced the symlink case: `tsx` run on a symlink to `next-record-id.ts` exits 0 silently.
- **Known in one place:** `verify-lockfile-union.ts:3-5` runs unconditionally because of this, but the other entry points were not changed.
- **`import.meta.main` is no fix here.** On Node 24.21 it is `undefined` for a `.ts` file under `tsx`, because this package declares no module type. It is `true` only for `.mts`.
- **Error-reporting patterns include the following.**
  - Many guards print only the error's message.
  - `merge-reviewed-pr.ts:838-843`, `verify-promotion.ts:315-320` and `documentation-archive.ts:779-784` do not catch, so an error prints a stack trace.
  - `export-question-feedback.ts` prints the whole error object.
  - `verify-migration-ledger.ts` prints code, message and remedy for typed ledger errors; other failures receive a fixed line. BUG-359 owns its hidden safe usage and target messages.

  - Reproduced 2026-10-19: `pnpm exec tsx scripts/content-release/activate-release --release x --expect-active y --reason r --authority a --apply` exits 0 with no output. With `.ts` it exits 1 and names the bad argument.

Corrected 2026-10-18: distinguish file-URL comparison and typed diagnostics; keep error reporting separate from entry detection.
Corrected 2026-10-19: add the production content commands to the impact; all three hand-run commands refuse a leading `--`.

## Impact

- **A silent no-op that exits 0.** With `--merge` nothing merges, so that path is safe. But the merge guard's read-only check, which `AGENTS.md` lists before any merge, can be mistaken for a pass. The promotion verifier's check can be mistaken for a pass the same way. The record ID prints nothing, which is noticed but not explained.
- **Production content commands too.** `seed/withdraw-questions.ts` and the four `content-release/` commands are run by hand against production (`docs/architecture/content-pipeline.md`). A mistyped `--apply` run prints nothing and exits 0, which an operator can take for an applied withdrawal, hold or activation.
- **Impact history is unverified.** This audit reproduced the no-ops but did not establish a mistaken approval or downstream incident.

## Options

1. **One shared helper** that decides whether its module is the executed file. It compares real paths, trying the module's extension and resolving symlinks. All guarded entry points use it. Preserve each caller's error handling: watcher diagnostics deliberately suppress provider output, and typed ledger diagnostics preserve safe remedies. Prove both native `.mts` and `tsx` `.ts` execution/import behavior before migration.
2. **Split each command into a module and a thin file that always runs**, as `verify-lockfile-union.ts` does. This adds a separate library file per command.
3. **Package scripts for the hand-run commands:** the merge guard, the promotion verifier and the record ID. This prevents most typos but leaves the guard as it is.

## Resolution

Implemented options 1 and 3. All 39 guarded entries under `scripts/`, plus the package-command entry in `tests/test-double-fidelity-live-scan.ts`, use the real-path helper in `scripts/lib/entry-point.mts`; caller-specific diagnostics remain separate. The bounded AST policy requires its top-level check and import, with explicit unconditional CLI exceptions. Runtime controls cover direct, extensionless, `.js`, symlink and imported entries, including native `.mts`. Package commands cover the merge guard, promotion verifier, record allocator, content operators, ledger and documentation audits; the operator guides use them. The commands take arguments directly (`pnpm pr:merge-reviewed 1560`); a forwarded pnpm `--` is refused like any unknown argument, as #1567 decided for strict parsers.

Corrected 2026-10-19: bind reproduction claims to the audited baseline and record the red-first implementation, passing local gate and remaining final-sync verification.

Corrected 2026-10-20: the commands no longer strip a leading `--`. #1567, merged first, rejected that option for strict parsers, and this record now follows it.

## Verification

- [x] A test runs a script by an extensionless path and by a symlink, and fails while either exits 0 without running.
- [x] Imports do not execute commands; direct, extensionless and symlink execution work for the supported runtimes. A source scan shows every guarded entry point uses the helper; intentional unconditional thin CLIs remain explicit exceptions.
- [x] Package scripts exist for the merge guard, the promotion verifier and the record ID, and `AGENTS.md` and the guides use them. They take arguments directly (`pnpm pr:merge-reviewed 1560`); like every strict parser since #1567, each refuses a forwarded `--`.

## Related

- DEBT-532: the scripts audit, and the shared building blocks.
- ADR-024: the merge guard's role.

Corrected 2026-10-20: recount the current guarded entries after dev added three content commands and the doubles-scan entry joined the shared check; keep the 36-entry census as baseline evidence.
