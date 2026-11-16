# BUG-329: Long Clone Names Change the Local Test Target in Child Commands

**Status:** Open — cap the generated instance at 48 characters, keeping its full hash, red first in `resolve-local-test-target.test.ts`
**Priority:** P4
**Date:** 2026-10-06

---

## Summary

A long clone basename produces an instance name longer than the resolver accepts
as an explicit instance. E2E passes that name to a child database command, which
truncates it again. The child uses a different Docker project on the same port.
If the clone's integration database is running, E2E stops at Docker startup,
before Playwright or any provider test starts. No current clone is affected:
the longest clone basename on the owner's machine, `naltrexone-university-csp-privacy`,
is 33 characters, and the failure starts at 40.

## Evidence

Checked at `34d9aea0` (2026-11-15):

- `deriveInstanceIdFromWorktree`
  (`scripts/test-lanes/resolve-local-test-target.ts:120`) appends `-` and an
  eight-character hash (:122-123) to the sanitized basename. The sanitizer caps
  its output at 48 characters (`.slice(0, 48)`, :174). So a basename that
  sanitizes to 40 characters or more gives an instance longer than 48: 39
  round-trips, 40 changes.
- Explicit instances pass through the same 48-character cap
  (`sanitizeExplicitInstanceId`, :179-187), so resolving a generated name again
  changes it.
- `scripts/test-lanes/e2e-local-orchestrator.ts:44-51` passes the resolved
  target's environment to `run-local-test-db.ts`, which resolves it again
  (`scripts/test-lanes/run-local-test-db.ts:33-34`). The environment keeps the
  ports, while the second resolution changes the project (:73).

This read-only probe uses a fixed long path, which need not exist:

```bash
pnpm exec tsx -e "import {resolveLocalTestTarget,createLocalTestTargetEnv} from './scripts/test-lanes/resolve-local-test-target';const cwd='/tmp/naltrexone-university-external-audit-20261006';const a=resolveLocalTestTarget({env:{},cwd});const b=resolveLocalTestTarget({env:createLocalTestTargetEnv(a),cwd});console.log(JSON.stringify({firstLength:a.instanceId.length,secondLength:b.instanceId.length,sameInstance:a.instanceId===b.instanceId,sameProject:a.composeProjectName===b.composeProjectName,samePort:a.dbPort===b.dbPort}));"
```

Output, on 2026-10-06 and again on 2026-11-15: `firstLength=54`,
`secondLength=48`, `sameInstance=false`, `sameProject=false`, `samePort=true`.
On 2026-10-06, after `pnpm db:test:up` and a passing integration lane,
`pnpm test:e2e` exited 1 with Docker's `port is already allocated`.

## Options

1. Require short clone directory names. This hides a valid-input failure.
2. Widen only the explicit-name cap. That spreads the length policy across two
   paths.
3. Produce one bounded instance name that re-resolves to itself.

## Resolution (decided)

Option 3. In `deriveInstanceIdFromWorktree`, cut the sanitized basename to 39
characters (48 less the nine-character suffix), strip trailing hyphens, then
append the full suffix. Name the 48 and the suffix length as constants, shared
with `sanitizeInstanceId`. Names that sanitize to 39 characters or fewer keep
their current instance, project and ports.

Red first, in `scripts/test-lanes/resolve-local-test-target.test.ts`: for
basenames of 39, 40, 48 and 60 characters, and one whose 39th character is a
separator, resolving `createLocalTestTargetEnv(target)` returns `target`
unchanged, and the instance ends with the full eight-character hash. A short
name's instance stays `<sanitized basename>-<hash>`. Today the 40-character
case and longer fail.

No guide change is needed: no current clone's target changes.

## Verification

- [x] The resolver mismatch is reproduced with the probe (2026-10-06, again
  2026-11-15), and E2E's Docker startup failure observed (2026-10-06).
- [ ] The round-trip test fails before the fix and passes after it.
- [ ] A short clone's instance is unchanged.

## Related

- [Testing infrastructure](../guides/testing/e2e-tests.md).
- AUDIT-014, the external record audit.

Corrected 2026-10-19: update the executable reproduction import after DEBT-532 moved test-lane files; the cited baseline and E2E defect remain unchanged.
Corrected 2026-11-15: line references moved with DEBT-532's move to `scripts/test-lanes/`; the Resolution names the files and the red test; dropped the guide change and the affected-clone E2E run, since no current clone is affected and the unit round-trip covers the child re-resolution.
