# DEBT-503: Clerk's Shared Backend API Allowance Is a Single Point of Failure

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — filed 2026-10-05; resolution decided per item below
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Every signed-in request spends one call of Clerk's Backend API allowance: `currentUser()` (`lib/container.ts:61-65`). Clerk limits that allowance per production instance. When it runs out, every signed-in page fails.

[BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md) showed the allowance can also be spent from outside, and fixed that with request limits in our middleware. Those limits trade a full outage for a smaller, cheaper one: once the site-wide cap fills, returning visitors whose session token has expired wait a minute.

This record holds the structural fixes, so that the allowance stops being the one thing every signed-in page depends on.

## Items

### 1. Read identity from the session token, not the Backend API (P2)

- **Evidence.** `ClerkAuthGateway.getCurrentUser` calls `currentUser()` on every signed-in render and action (`src/adapters/gateways/clerk-auth-gateway.ts`, through `lib/container.ts:61-65`). The middleware has already verified the session token, which carries the Clerk user ID.
- **Decided.**
  - Resolve the app user from the verified token's user ID and our own `users` table.
  - Call the Backend API only to provision a user seen for the first time, or when our row is missing.
  - Email changes arrive through the Clerk webhook. Document stale/missed-update recovery, verified-email selection and deletion races with DEBT-502; the fast path must not bypass tombstones or silently change ownership rules.

  This removes the largest consumer of the allowance, but does not by itself justify raising BUG-323's caps; item 2 still needs a burst and retry budget. It moves here from DEBT-502 item 4.
- **Care.** BUG-284's identity rules and BUG-320's provisioning race must hold. Test-first against the maintained fakes and real Postgres.

### 2. Let only forged requests fill the site-wide cap (P3)

- **Evidence.** BUG-323's site-wide cap counts every request that would make Clerk call its Backend API, real or forged. So an attacker who fills it also delays real returning visitors. Its one-minute window differs from Clerk's ten-second window, so the average ratio does not establish reserved capacity.
- **Options.**
  1. Count only failed lookups. Clerk's answer, read after the middleware runs, shows whether a lookup succeeded.
  2. Accept a handshake value only from a browser our middleware just redirected to Clerk.
  3. Clerk validates the value before spending the allowance. This was reported to Clerk on 2026-10-05.
- **Decided.** Revisit after Clerk replies and item 1 ships. Counting failed lookups after the call cannot protect the allowance already spent. Keep pre-call bounds until a verified SDK mechanism distinguishes requests before spending it. Size bounds to Clerk's actual 10-second window, including retries and concurrent instances; a minute average proves no burst headroom. Do not raise caps from averages alone.

### 3. Alert when a cap trips or Clerk refuses a call (P3)

- **Evidence.** Today a tripped cap is visible only as 429 responses, and a Clerk refusal only as errors from `currentUser()`.
- **Options.** A pino summary alone cannot drive a Sentry alert: the current logger has no Sentry transport. Forwarding every log adds collection and quota costs. A bounded, explicit operational event is sufficient.
- **Decided.** Aggregate trips and Clerk 429s across instances under a shared, atomic window; a per-process counter is not a site-wide count. Send at most one sanitized Sentry event per window through an outer-layer adapter, with fixed tags and counts only, and route its issue alert to the owner. Keep vendor imports outside the application/domain. Retain the pino summary for immediate diagnosis. Prove duplicate suppression with concurrent writers, and verify one test event reaches the configured alert before claiming delivery. Document Attack Mode as the response.

  *Corrected 2026-10-06: `lib/logger.ts` writes stdout, while `instrumentation.ts` captures exceptions; no pino-to-Sentry forwarding is installed. The account API confirms Developer, not a paid logging assumption.*

### 4. Measure the real volume of these requests (P3)

- **Decided.** Record the per-minute count of requests that would make Clerk call its Backend API. Retune BUG-323's caps from that number instead of from the allowance alone.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register.

## Related

- [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the request limits this builds on.
- [DEBT-502](./debt-502-account-identity-and-action-hardening.md) item 4: where item 1 was first recorded.
