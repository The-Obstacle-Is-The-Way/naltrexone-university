# BUG-323: Anonymous Requests Can Spend Clerk's Shared Backend API Limit

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — owner confirms the production limiter writes its rows; due 2026-10-19
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Some request shapes make Clerk's SDK, inside our middleware, call Clerk's Backend API with our secret key before the request is answered. Anyone can send them, without an account.

Clerk limits each production instance's Backend API calls, and every signed-in page shares that allowance: `currentUser()` is one such call. So enough of these requests would use the allowance up, and every signed-in page, practice and subscribe would fail until they stopped. People could still sign in, but nothing behind sign-in would work.

This record is deliberately general. The repository is public, and the behaviour is in Clerk's SDK, which other Clerk customers also run.

## Evidence

- **Clerk's SDK.** In `@clerk/backend` 3.18.1, used by `@clerk/nextjs` 7.9.x, two request shapes lead to a Backend API call before Clerk answers:
  - a request carrying a handshake value;
  - a GET whose session token has expired but can be refreshed.

  Neither needs a valid account, and nothing checks the value before the call. Both were read in the SDK source.
- **Measured on our development instance only, 2026-10-05.**
  - Requests of the first shape each made a Backend API call.
  - Enough of them left an unrelated Backend API call rate-limited for the rest of the window.
  - The same number of ordinary requests did not.

  Production was not tested.
- **Clerk's documented limit.** Clerk documents a per-instance Backend API limit ([system limits](https://clerk.com/docs/guides/how-clerk-works/system-limits)), and states that `currentUser()` counts against it.
- **Our middleware runs Clerk on every page and API route** (`proxy.ts`, the `config.matcher`). So these requests reach the SDK unless something stops them first.
- **Prior art.** Clerk's tracker has an issue on the same code path, about failure handling rather than abuse: [clerk/javascript#9114](https://github.com/clerk/javascript/issues/9114).

## Impact

For as long as an attacker kept sending these requests, every signed-in page would fail. That includes the pricing page for a signed-in learner and the add-card flow. Nothing is lost permanently; the damage is the outage.

## Options

1. **A per-address limit in our middleware,** before Clerk runs.
2. **A per-session limit on refreshes.** This groups refresh attempts by the session claim read before Clerk verifies it. It is a supplementary limit, not proof of an authenticated identity.
3. **A site-wide limit.** Many addresses together can get past a per-address limit; a site-wide cap bounds the total.
4. **A Vercel firewall rule** at the edge.
5. **Tell Clerk,** so the SDK stops spending a customer's allowance on unchecked requests.

## Resolution (decided)

All five, under the owner's 2026-09-28 delegation. The owner approved the firewall rule (option 4) and the report to Clerk (option 5).
- Per address: 30 a minute. A request with no readable client address skips this limit, so one sender cannot refuse every other such request through a shared bucket. The other two limits still apply, and the platform normally supplies the address; the code explicitly handles its absence. (Added after CodeRabbit's review.)
- Per refreshing session: 6 a minute.
- Site-wide: 1,000 a minute.
- A limiter that fails lets the request through and logs `clerk_backend_call_limiter_failed`. Failing closed would break every real refresh while the database is down, and the firewall still bounds the volume.
- **The limits apply only on a production Clerk instance** (a `pk_live_` key). The allowance at stake is production's.
  - A development instance handshakes every new browser session, and that serves E2E, local work and Preview.
  - The first version limited every instance. During this pull request's own gate, 9 of 63 E2E tests stopped at the limit page, because the suite opens dozens of sessions from one address.

**The site-wide cap is a trade-off, sized on purpose** (corrected 2026-10-05, before shipping, from a first figure of 300).
- The cap cannot tell a real request from a forged one. So filling it refuses the real ones too, until the minute resets.
- The people refused are returning visitors whose short-lived session token has expired. They see the page below. People already signed in, whose browser keeps its token fresh, are unaffected, and so are signed-out visitors.
- That is the trade: without the cap, an attack drains Clerk's allowance and every signed-in page fails; with it, an attack delays returning visitors by a minute.
- The cap is therefore sized against what it protects. Clerk documents 1,000 calls per 10 seconds. The 1,000-per-minute cap bounds request count over its own window; it does not reserve 80% of every Clerk window or prove a bound on SDK retries. Matching the vendor window and counting call cost are open in DEBT-503 item 2.
- Tripping the cap takes about 34 addresses at the per-address limit; at 300 it would have taken 10.
- The per-session limit bounds repeated requests assigned to the same session bucket. It does not replace the address and site limits.
- Better discrimination, so that forged requests alone fill the cap, is tracked in [DEBT-503](../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md).

What a limited person sees:
- a browser gets a short page asking them to wait a minute and try again;
- other clients get a JSON 429;
- both carry `Retry-After`;
- the response clears the handshake cookies, so the next request does not count again.

## Progress

- **2026-10-05, firewall.** The owner approved a Vercel firewall rule for these requests, which went live the same day. It was checked in production: normal pages were unaffected, and requests over the limit got 429. It also narrows the owner's 2026-09-20 decision against firewall rules (SPEC-017 E1, archived) to this one case.
- **2026-10-05, report.** Reported to Clerk's security team (security@clerk.dev), following Clerk's vulnerability disclosure policy. No reply yet.
- **2026-10-05, code.** The middleware limits (options 1 to 3) were added in the pull request that files this record.
  - Tests in `proxy-clerk-backend-calls.test.ts`, red first, cover:
    - each request shape, and the look-alikes it must ignore;
    - each limit;
    - the browser page and the cleared cookies;
    - a failing or unloadable limiter;
    - the proxy answering before Clerk runs.
  - Each rule was deliberately broken in turn, and every break was caught by a test.

## Operations

- **Rollback.**
  - Disable the firewall rule in the Vercel dashboard (Firewall, custom rules).
  - Revert the pull request.
- **Under attack:**
  - Vercel's Attack Mode is available on every plan.
  - The limiter's failures show in the logs as `clerk_backend_call_limiter_failed`.
  - Clerk refusals show in Sentry as 429s from the Backend API's user lookup, which since DEBT-503 item 1 runs only to provision a user or refresh billing's email.
- **Unknown.** Vercel's Hobby plan includes a fixed number of rate-limited requests. Vercel has not documented what happens beyond it.

## Verification

**External audit, 2026-10-06:** #1385 merged as `8d78fe98` and promotion #1386 as `0e25259b`; the production assignment was 2026-10-06T03:51:13.211Z. The source and unit cases implement the production-key branch. The earlier firewall, disclosure and local mutation receipts below are the original operator's reports; this audit has not independently reproduced them. Production enforcement remains the owner's check, not an inference from development E2E.

- [x] The firewall stopgap is live and checked in production.
- [x] The report to Clerk is filed.
- [x] Unit tests, red first, cover the request shapes, all three limits, the 429 responses and the fail-open path, and every deliberate break was caught.
- [x] The full E2E suite passes with the limits in place (they stay off on the development instance it uses).
- [x] Production runs Clerk's live instance, the condition that turns the limits on (`proxy.ts:239`): on 2026-10-06 the production sign-in page served a `pk_live_` key and Clerk reported a production instance.
- [ ] Owner, by 2026-10-19: a read-only count of production `rate_limits` rows whose key starts with `clerk-backend-call:` in the last 24 hours is above zero, which shows the limiter runs. The limiter counts only handshake or expired-session requests, so if the count is zero, send one request with `?__clerk_handshake_nonce=check` and count again; zero after that fails the check. It needs production database access, which engineering does not use. A live key shows only that the limiter is called: it fails open, logging to stdout that Vercel keeps for an hour; [DEBT-505](../debt/debt-505-logged-only-failures-alert-nobody.md) will alert on that failure. *Corrected 2026-10-06: a `pk_live_` key proves the limiter is called, not that it works (#1410 review).*
- [x] Keep the firewall rule as defence in depth. Decided 2026-10-06 under the owner's delegation: it costs nothing, answers before any Clerk call, and the project's only rate-limit rule slot has no better use.

## Related

- [DEBT-503](../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md): the structural follow-ups. They are reading identity from the session token so signed-in pages stop spending the allowance, telling forged requests apart before they count, and alerting when a cap trips.
- SPEC-017 (archived), E1: the earlier firewall decision.
