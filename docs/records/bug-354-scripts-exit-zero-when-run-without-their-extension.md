# BUG-354: Scripts Exit 0 Without Running When Called Without Their Extension or Through a Symlink

**Status:** Open — one shared entry helper that resolves the executed path, red first; then package scripts for the hand-run commands
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

Thirty-five entry points under `scripts/` (33 `.ts` and 2 `.mts`) decide whether to run by comparing `import.meta.url` with `process.argv[1]`. The two differ when the path omits `.ts` (which `tsx` resolves anyway) or goes through a symlink. The script then does nothing and exits 0.

The merge guard and the promotion verifier are run by hand, and by agents following `AGENTS.md`. So a mistyped `pnpm exec tsx scripts/merge-reviewed-pr <PR>` prints nothing and exits 0, which a person or an agent can take for a pass.

## Evidence

- **Reproduced 2026-10-18:**
  - `pnpm exec tsx scripts/merge-reviewed-pr` exits 0 with no output. With `.ts` it exits 1 with its usage error.
  - `pnpm exec tsx scripts/next-record-id debt` exits 0 with no output. With `.ts` it prints the ID.
  - The second agent's challenge reproduced the symlink case: `tsx` run on a symlink to `next-record-id.ts` exits 0 silently.
- **Known in one place:** `verify-lockfile-union.ts:3-5` runs unconditionally because of this, but the other entry points were not changed.
- **`import.meta.main` is no fix here.** On Node 24.21 it is `undefined` for a `.ts` file under `tsx`, because this package declares no module type. It is `true` only for `.mts`.
- **Errors are reported three ways.**
  - Some guards print only the error's message.
  - `merge-reviewed-pr.ts:838-843` and `verify-promotion.ts:315-320` do not catch, so a usage error prints a stack trace.
  - `export-question-feedback.ts` prints the whole error object.

## Impact

- **A silent no-op that exits 0.** With `--merge` nothing merges, so that path is safe. But the merge guard's read-only check, which `AGENTS.md` lists before any merge, can be mistaken for a pass. The same holds for the promotion verifier and the record ID.
- **No known occurrence.**

## Options

1. **One shared helper** that decides whether its module is the executed file. It compares real paths, trying the module's extension and resolving symlinks. All 35 entry points use it, and the helper also owns the catch-and-exit policy, so every entry point reports an error the same way.
2. **Split each command into a module and a thin file that always runs**, as `verify-lockfile-union.ts` does. This doubles the number of entry files.
3. **Package scripts for the hand-run commands:** the merge guard, the promotion verifier and the record ID. This prevents most typos but leaves the guard as it is.

## Resolution (proposed)

Options 1 and 3. The helper is one of the shared building blocks DEBT-532 proposes.

## Verification

- [ ] A test runs a script by an extensionless path and by a symlink, and fails while either exits 0 without running.
- [ ] A source scan shows every entry point uses the helper.
- [ ] Package scripts exist for the merge guard, the promotion verifier and the record ID, and `AGENTS.md` and the guides use them.

## Related

- DEBT-532: the scripts audit, and the shared building blocks.
- ADR-024: the merge guard's role.
