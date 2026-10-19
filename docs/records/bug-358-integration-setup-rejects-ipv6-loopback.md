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

No IPv6 integration target works today, with or without the remote-database override. postgres.js 3.4.9 reads the host of `postgresql://…@[::1]:5432/…` as `[` (`postgres(url).options.host` is `["["]`, with no connection opened), and setup, `lib/db.ts` and the suites pass the URL string to it. So the refusal names the wrong cause for a target the driver cannot reach. The default resolver uses IPv4 and is unaffected. `e2e-local-orchestrator.ts:135` accepts `[::1]` but meets the same driver limit.

Corrected 2026-10-19: the override is no workaround, because the driver cannot parse a bracketed IPv6 host.

## Options

1. Add `[::1]` locally with a focused regression test.
2. Share a pure loopback predicate while preserving each command's separate authorization policy and URL validation.

## Resolution (proposed)

Option 2 if the extraction remains small; otherwise option 1 first. Do not merge the human acknowledgment and test-lane opt-in policies incidentally.

## Verification

- [ ] Red-first proof that setup classifies `[::1]` as local and still rejects remote hosts.
- [ ] Either an IPv6 connection through the supported driver is proven, or the integration guide says targets use an IPv4 or named host.
- [ ] Existing IPv4 resolver integration lane passes.

## Related

- DEBT-532: inconsistent target checks.
