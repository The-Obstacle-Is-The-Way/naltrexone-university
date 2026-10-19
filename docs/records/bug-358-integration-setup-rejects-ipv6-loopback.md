# BUG-358: Integration Setup Rejects IPv6 Loopback

**Status:** Open — normalize integration loopback hostnames, red first
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

Integration setup rejects a valid IPv6 loopback URL as remote. Its local-host predicate expects `::1`, but Node's `URL.hostname` returns `[::1]`.

## Evidence

- `tests/integration/setup.ts:16-19` accepts `localhost`, `127.0.0.1` or `::1`; `:55-70` passes `new URL(databaseUrl).hostname` directly to that predicate and throws before opening the database.
- On Node 24.21.0, `node -e 'console.log(new URL("postgresql://postgres:postgres@[::1]/test").hostname)'` prints `[::1]`.
- Extracting the actual `isLocalDatabaseHost` function with the TypeScript parser and transpiling it, without importing setup or opening a database, returned true for `localhost` and `127.0.0.1`, false for `[::1]`.
- `scripts/e2e-local-orchestrator.ts:135` already includes `[::1]`; `scripts/database-target.ts` normalizes brackets before classifying loopback.

## Impact

An intentional IPv6 local integration target is refused unless the operator enables the remote-database override. The default resolver uses IPv4 and is unaffected. Enabling a remote override is an unnecessarily broad workaround.

## Options

1. Add `[::1]` locally with a focused regression test.
2. Share a pure loopback predicate while preserving each command's separate authorization policy and URL validation.

## Resolution (proposed)

Option 2 if the extraction remains small; otherwise option 1 first. Do not merge the human acknowledgement and test-lane opt-in policies incidentally.

## Verification

- [ ] Red-first proof that setup accepts IPv6 loopback without the remote override and still rejects remote hosts.
- [ ] Existing IPv4 resolver integration lane passes.

## Related

- DEBT-532: inconsistent target checks.
