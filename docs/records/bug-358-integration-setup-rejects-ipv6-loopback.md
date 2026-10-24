# BUG-358: Integration Setup Rejects IPv6 Loopback

**Status:** Verifying — promotion to main; due 2026-10-26
**Priority:** P4
**Date:** 2026-10-18

---

The Summary, Evidence and Impact describe audit baseline `0680cb2d`, before this fix; Resolution describes the implementation in this PR.

## Summary

Integration setup rejects a valid IPv6 loopback URL as remote. Its local-host predicate expects `::1`, but Node's `URL.hostname` returns `[::1]`.

## Evidence

- `tests/integration/setup.ts:16-19` accepts `localhost`, `127.0.0.1` or `::1`; `:55-70` passes `new URL(databaseUrl).hostname` directly to that predicate and throws before opening the database.
- On Node 24.21.0, `node -e 'console.log(new URL("postgresql://postgres:postgres@[::1]/test").hostname)'` prints `[::1]`.
- Extracting the actual `isLocalDatabaseHost` function with the TypeScript parser and transpiling it, without importing setup or opening a database, returned true for `localhost` and `127.0.0.1`, false for `[::1]`.
- `scripts/e2e-local-orchestrator.ts:135` already includes `[::1]`; `scripts/database-target.ts` normalizes brackets before classifying loopback.

## Impact

An integration URL with an IPv6 literal host cannot work through these URL-string call sites today, with or without the remote-database override. Named hosts may resolve to IPv6; this evidence does not rule that out. postgres.js 3.4.9 reads the host of `postgresql://…@[::1]:5432/…` as `[` (`postgres(url).options.host` is `["["]`, with no connection opened), and setup, `lib/db.ts` and the suites pass the URL string to it. So the refusal names the wrong cause for a target the driver cannot reach. The default resolver uses IPv4 and is unaffected. `e2e-local-orchestrator.ts:135` accepts `[::1]` but meets the same driver limit.

Corrected 2026-10-19: the override is no workaround, because the driver cannot parse a bracketed IPv6 host.

## Options

1. Add `[::1]` locally with a focused regression test.
2. Share a pure loopback predicate while preserving each command's separate authorization policy and URL validation.

## Resolution

Implemented the small shared predicate from option 2 in `scripts/lib/loopback-hostname.ts`. Seven consumers use exact loopback classification with bracket normalization; the human database commands' target check (`scripts/database-target.ts`) adopts it when DEBT-532 moves the database scripts. Human commands separately retain their existing 127/8 allowance; URL validation, managed authorization and test-lane opt-ins remain caller-owned. The integration guide requires the exact resolver URL for the full local lane; hostname substitution does not satisfy its session-proof suites. It separately explains that loopback classification does not repair postgres.js’s literal-IPv6 URL parsing. Integration setup therefore refuses `[::1]` with that driver limit and asks for `127.0.0.1` or `localhost`, instead of calling it non-local.

Corrected 2026-10-19: bind reproduction claims to the audited baseline and record the red-first implementation, passing local gate and remaining final-sync verification.

Corrected 2026-10-20: setup no longer passes `[::1]` on to a driver that cannot connect to it, and its host decision is now a tested function (`tests/shared/integration-database-host.ts`), so the remote-host refusal has a behavioral test rather than a source scan.

## Verification

- [x] Red-first proof that setup no longer calls `[::1]` non-local, refuses it with the driver limit, and still rejects remote hosts unless overridden.
- [x] The integration guide states the driver limitation and the full lane’s exact resolver-target requirement.
- [x] Existing IPv4 resolver integration lane passes.

## Related

- DEBT-532: inconsistent target checks.

Corrected 2026-10-19: narrow the driver claim to literal IPv6 URLs and use P4 for the misleading classification; no supported resolver lane is lost.

Corrected 2026-10-19: distinguish the driver’s named-host possibility from the full lane’s stricter resolver-URL contract; local IPv4 integration passed.
