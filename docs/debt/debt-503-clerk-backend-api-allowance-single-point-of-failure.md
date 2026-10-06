# DEBT-503: Clerk's Shared Backend API Allowance Is a Single Point of Failure

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — decided per item; item 1 (identity from the session token) first
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

  *Corrected 2026-10-06: the decision now names the recovery of a stale or missed email update, verified-email selection and deletion races (#1410).*
- **Care.** BUG-284's identity rules and BUG-320's provisioning race must hold. Test-first against the maintained fakes and real Postgres.

### 2. Let only forged requests fill the site-wide cap (P3)

- **Evidence.** BUG-323's site-wide cap counts every request that would make Clerk call its Backend API, real or forged. So an attacker who fills it also delays real returning visitors. Its one-minute window differs from Clerk's ten-second window, so the average ratio does not establish reserved capacity.
- **Options.**
  1. Count only failed lookups. Clerk's answer, read after the middleware runs, shows whether a lookup succeeded.
  2. Accept a handshake value only from a browser our middleware just redirected to Clerk.
  3. Clerk validates the value before spending the allowance. This was reported to Clerk on 2026-10-05.
- **Decided.** Revisit after Clerk replies and item 1 ships, starting from option 1 in two levels. A site-wide ceiling counts every lookup before the call and is never refunded, so it still bounds what Clerk's allowance can spend, including successful refreshes from free accounts. Below it, a lower refusal threshold counts lookups before the call and refunds each one that Clerk's answer shows succeeded, so forged lookups fill that threshold while real visitors pass. Size the window and cap to Clerk's 10-second window, including retries and concurrent instances; a minute average proves no burst headroom. Do not raise caps from averages alone.

  *Corrected 2026-10-06: #1410 ruled option 1 out by considering only counting after the call; a never-refunded ceiling with a refunded threshold below it keeps the bound and meets this item's goal (#1410 review).*

### 3. Alert when a cap trips or Clerk refuses a call (P3)

- **Evidence.** Today a tripped cap is visible only as 429 responses, and a Clerk refusal only as errors from `currentUser()`.
- **Options.** A pino summary alone cannot drive a Sentry alert: the current logger has no Sentry transport. Forwarding every log adds collection and quota costs. A bounded, explicit operational event is sufficient, but one error event per minute would allow 43,200 events in 30 days against this account’s 5,000-error monthly allowance. A per-window bound alone does not protect that quota.
- **Decided.** Count trips and Clerk 429s site-wide with one key on BUG-323's existing shared Postgres limiter (`lib/clerk-backend-call-limit.ts`), used as a cooldown: at most one notification per cooldown window. The limiter is atomic and survives restarts, so the cooldown alone bounds the monthly count; size it so that bound is a small share of the 5,000-error allowance. Windows are fixed, so one per six hours allows at most 124 in a 31-day month, and the cooldown must stay within the limiter's 24-hour row retention, or pruning would reset it. Counts for the event come from the pino summary. Send sanitized Sentry events through an outer-layer adapter, with fixed tags and counts only, and route the issue alert to the owner. Keep vendor imports outside the application and domain layers, and keep the pino summary for immediate diagnosis. Prove the bound with concurrent writers and sustained trips, and confirm one test event reaches the configured alert before claiming delivery. Document Attack Mode as the response. [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) F07's missed-deadline alert needs the same path.

  *Corrected 2026-10-06: one cooldown key on the existing limiter replaces #1410's incident transition, cooldown and separate budget, three mechanisms for one bound (#1410 review).*

  *Corrected 2026-10-06: `lib/logger.ts` writes stdout, while `instrumentation.ts` captures exceptions; no pino-to-Sentry forwarding is installed. The account API confirms Developer, not a paid logging assumption.*

### 4. Measure the real volume of these requests (P3)

- **Decided.** Record the per-minute count of requests that would make Clerk call its Backend API. Retune BUG-323's caps from that number instead of from the allowance alone.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register.

## Related

- [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the request limits this builds on.
- [DEBT-502](./debt-502-account-identity-and-action-hardening.md) item 4: where item 1 was first recorded.
