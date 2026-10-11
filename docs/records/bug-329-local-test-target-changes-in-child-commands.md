# BUG-329: Long Clone Names Change the Local Test Target in Child Commands

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — canonicalize generated instance names before passing them to child commands
**Priority:** P4
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** —

## Summary

A long clone basename produces an instance name longer than the resolver accepts
as an explicit instance. E2E passes that name to a child database command, which
truncates it again. The child uses a different Docker project on the same port.
If the clone's integration database is running, E2E stops at Docker startup.
This was observed before Playwright or any provider test started.

## Evidence and reproduction

Inspected at `af21b710` (the code is unchanged from main `0f324edd`):

- `deriveInstanceIdFromWorktree` (`scripts/resolve-local-test-target.ts:111`)
  appends a nine-character suffix (`-` and an eight-character hash, :113-114)
  after sanitizing the basename. The sanitizer caps its normalized output at 48
  characters (:165). So a basename that sanitizes to 40 characters or more gives
  an instance longer than 48: measured, 39 round-trips and 40 changes.
- Explicit instances pass through that same 48-character cap. The generated
  result can be longer than 48, so resolving it again changes the instance.
- `scripts/e2e-local-orchestrator.ts:67` passes the resolved target environment
  into `run-local-test-db.ts`, which resolves it again. The environment retains
  the original database port while the second resolution changes the project.

From any clone, run this read-only probe with a fixed long-path fixture. The
fixture directory need not exist; the resolver only uses the path string:

```bash
pnpm exec tsx -e "import {resolveLocalTestTarget,createLocalTestTargetEnv} from './scripts/resolve-local-test-target';const cwd='/tmp/naltrexone-university-external-audit-20261006';const a=resolveLocalTestTarget({env:{},cwd});const b=resolveLocalTestTarget({env:createLocalTestTargetEnv(a),cwd});console.log(JSON.stringify({firstLength:a.instanceId.length,secondLength:b.instanceId.length,sameInstance:a.instanceId===b.instanceId,sameProject:a.composeProjectName===b.composeProjectName,samePort:a.dbPort===b.dbPort}));"
```

Output: `firstLength=54`, `secondLength=48`, `sameInstance=false`,
`sameProject=false`, `samePort=true`. After `pnpm db:test:up`, migration,
seed and a passing integration lane, `pnpm test:e2e` exited 1 with Docker's
`port is already allocated` error. Docker listed the original full-name project
on the resolver-selected port. No other clone's container was changed.

## Options

1. Require short clone directory names. This hides a valid-input failure and
   leaves the resolver's exported environment inconsistent with its own input.
2. Widen only the explicit-name cap. That spreads the length policy across two
   paths and can still change targets when future suffixes are added.
3. Produce one canonical bounded instance name and preserve it on re-resolution.
   Reserve space for the full hash suffix when shortening a generated basename.

## Resolution (decided)

Option 3. Keep the existing mapping for names already within the accepted limit.
For longer generated names, shorten the readable basename before appending the
full suffix. Resolving `createLocalTestTargetEnv(target)` must preserve the
instance, project, ports and URLs. Do not truncate away the disambiguating hash.
Document the changed local target for affected long clone names and how to stop
an old clone-owned project without deleting its volume.

Until that code change ships, an operator can use a short explicit
`LOCAL_TEST_INSTANCE` consistently for every local test command, resolving all
ports through the existing script. This is a local workaround, not a shipped fix.

## Verification

- [x] Implementer reproduced the resolver mismatch with the read-only probe and
  observed E2E's Docker startup failure on 2026-10-06.
- [ ] Implementer adds red-first round-trip tests for ordinary, boundary-length,
  long and explicitly named instances; every target field must be preserved.
- [ ] Implementer proves ordinary existing clone targets remain unchanged and
  long names retain their full hash suffix.
- [ ] Implementer runs integration followed by E2E in one affected clone without
  an explicit instance workaround; both use the same project and resolved port.

## Related

- [Testing infrastructure](../dev/testing-infrastructure.md).
- [External audit](../_archive/audits/audit-014-external-record-audit-2026-10-06.md).
