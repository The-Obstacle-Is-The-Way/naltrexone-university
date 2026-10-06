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
  - Email changes keep arriving through the Clerk webhook.

  This removes the largest consumer of the allowance, which also lets BUG-323's caps rise. It moves here from DEBT-502 item 4.
- **Care.** BUG-284's identity rules and BUG-320's provisioning race must hold. Test-first against the maintained fakes and real Postgres.

### 2. Let only forged requests fill the site-wide cap (P3)
- **Evidence.** BUG-323's site-wide cap counts every request that would make Clerk call its Backend API, real or forged. So an attacker who fills it also delays real returning visitors. It is sized at about a sixth of Clerk's allowance, so filling it takes many addresses, but the lever exists.
- **Options.**
  1. Count only failed lookups. Clerk's answer, read after the middleware runs, shows whether a lookup succeeded.
  2. Accept a handshake value only from a browser our middleware just redirected to Clerk.
  3. Clerk validates the value before spending the allowance. This was reported to Clerk on 2026-10-05.
- **Decided.** Revisit when Clerk replies, and after item 1 ships, when the caps can rise. Option 1 is the first candidate.

### 3. Alert when a cap trips or Clerk refuses a call (P3)
- **Evidence.** Today a tripped cap is visible only as 429 responses, and a Clerk refusal only as errors from `currentUser()`.
- **Decided.** Count trips and Clerk 429s per minute, and log one summary line per minute, not one per request, so the alert cannot itself flood the logs. Add a Sentry alert on that line, routed to the owner, with Vercel's Attack Mode as the documented response.

### 4. Measure the real volume of these requests (P3)
- **Decided.** Record the per-minute count of requests that would make Clerk call its Backend API. Retune BUG-323's caps from that number instead of from the allowance alone.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register.

## Related

- [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the request limits this builds on.
- [DEBT-502](./debt-502-account-identity-and-action-hardening.md) item 4: where item 1 was first recorded.
