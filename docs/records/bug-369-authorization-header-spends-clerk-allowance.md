# BUG-369: An Authorization Header Lets Requests Spend Clerk's Backend API Allowance Uncounted

**Status:** Verifying — the proxy's 401 in production and the next runs of both crons; due 2026-11-06
**Priority:** P2
**Date:** 2026-10-24

---

## Summary

BUG-323's limiter counts the requests that make Clerk's middleware call its Backend API through a cookie or a handshake value. But Clerk's middleware also reads a token from the `Authorization` header, and two header shapes reached a Backend API call that the proxy never counted and the firewall never matched:

1. **A genuine, expired session token in the header, on a GET with any `__refresh_<suffix>` cookie.** Clerk verifies the signature, finds the token expired, and calls `sessions.refreshSession`. This needs one free account, once. The token's signature stays valid for as long as the instance's signing key does, and Clerk calls refresh even for an ended session.
2. **A value shaped like an API key or machine token (`ak_`, `mt_`, `oat_`), on any method.** Clerk verifies it through a Backend API call. No account is needed.

Each request was one Backend API call that none of our limits counted: per address, per session or site-wide. The refreshes certainly draw on the instance's Backend API allowance (1,000 calls per 10 seconds in production). That allowance also serves every signed-in visitor's server-side refresh and handshake, and the provisioning of new users, so draining it signs returning visitors out and stops new users being provisioned for as long as it lasts. Whether the machine-token verifications draw on the same allowance is not verified (see Evidence).

Found on 2026-10-24 while assessing DEBT-503 item 4. The finding was kept private until the first firewall rule (below) was live.

## Evidence

- **From the SDK** (`@clerk/backend` 3.25.0, `@clerk/nextjs`), read and then challenged by a second agent:
  - `@clerk/nextjs` sets `acceptsToken: "any"` after applying our options, so we cannot turn it off (`clerkMiddleware.js`, around line 240). Clerk's own comment there calls the case "an economic attack".
  - Whenever an `Authorization` header exists, Clerk takes the header path, with or without a `Bearer` scheme.
  - The signature is checked before the authorized party and the expiry, and `authorizedParties` is unset. An expired token is then eligible for refresh on a GET with a refresh cookie, and the refresh uses the header's token when there is no session cookie.
  - Machine tokens are verified through the Backend API.
  - The proxy read only `__session*` cookies and handshake values (`lib/clerk-backend-call-limit.ts`). BUG-323's firewall rule matches only `__clerk_handshake_nonce`.
- **The real middleware.** A private test ran Clerk's middleware over a stubbed fetch:
  - a genuine expired token in the header, with a made-up refresh cookie, reached `/v1/sessions/<sid>/refresh` for both page and JSON requests, and `triggersClerkBackendCall` returned false;
  - a forged token made no call;
  - `ak_`, `mt_` and `oat_` values each reached a Backend API verification call.
- **Who sends the header.** Only Vercel Cron, to the two cron routes, with `CRON_SECRET`. No page, server action, client code or webhook sends it: Stripe, Clerk and Resend sign their webhooks in their own headers.
- **Not verified:** whether the machine-token verification endpoints draw on the same allowance as the rest of the Backend API.

## Impact

- **Before the first live sale:** no subscriber is affected, but a drain would still have signed out the owner's and testers' sessions.
- **After launch:** a script with one free account could have made Clerk refuse the calls every returning visitor needs. A script without an account could have done the same only if machine-token verification draws on that allowance, which is not verified.
- **Alerts:** DEBT-503 item 3's alert counts failed refreshes and raises past 10 a minute. A made-up refresh value fails at Clerk, so a drain using one would alert, except on a protected route's non-page request, whose combined auth reason the counter's prefix check misses (read from code). A refresh using the attacker's own genuine refresh value succeeds and never counts, and the machine-token shapes are not refreshes at all, so neither would alert.

## Options

1. **Refuse the header before Clerk.** Send the cron routes past Clerk, since they check `CRON_SECRET` themselves, and answer 401 before Clerk to any other request that carries an `Authorization` header. This closes both shapes, keeps the work from happening rather than counting it, and depends on nothing else.
2. **Count the header shapes in the limiter.** This only bounds the drain, misses machine tokens unless each prefix is listed, and still spends a Backend API call per request.
3. **A Vercel firewall rule** denying the header everywhere except `/api/cron/`. It acts at the edge at once, but only for the deployed project's firewall.

## Resolution (decided)

Options 3 then 1, under the owner's decision of 2026-10-24.

- **Containment.** At the owner's request, two Vercel firewall rules, applied through the CLI and checked against production:
  - **15:21:45Z:** deny the header on every path that does not start with `/api/cron/`.
  - **15:34:32Z:** on `/api/cron/`, deny a header holding a JWT (any `.`) or a value starting with `ak_`, `mt_` or `oat_`, with or without `Bearer`. Until this fix deploys, the proxy still runs Clerk on the cron routes, so the first rule's exception was a way round it.

    This PR was opened at about 15:28Z, describing that exception, so it was public for about six minutes. `CRON_SECRET` is 64 hexadecimal characters (`openssl rand -hex 32`, in the environments guide), so it never matches the second rule.
  - Both rules cover every hostname of the project. On 2026-10-25 at 11:40:43Z they became one rule with the same conditions, "BUG-369 refuse Clerk-readable Authorization", to make room for DEBT-503's rule within the Hobby plan's three, and were checked again on every hostname.

    *Corrected 2026-10-25: the rule comes out after the production check instead of staying as defense in depth, since its cron checks then protect nothing but still bind `CRON_SECRET`'s shape and hold one of three rule slots (Edge Rules in `docs/architecture/security.md`).*
- **The fix.**
  - `proxy.ts` sends `CRON_ROUTE_PATHS` (`lib/public-routes.ts`) on without Clerk.
  - It answers 401 to every other request that carries an `Authorization` header, public resources included, before BUG-323's limiter and before Clerk.
  - The cron routes' public-route patterns come from the same list.
- **Docs.** `docs/architecture/integrations/clerk.md` states the rule, and `docs/architecture/security.md` links to it.
- **Follow-up.** Tell Clerk about both shapes with DEBT-503 item 2's report (option 3). That is the owner's action.

## Verification

- [x] `proxy-authorization-header.test.ts`:
  - the header gets a 401 before Clerk runs on a protected page, a public page, a public API route, a public resource, and a path that only starts like a cron route, with or without a scheme;
  - each cron route passes without starting Clerk;
  - a request without the header still reaches Clerk.

  Each case failed before the change.
- [x] `proxy-authorization-header-sdk.test.ts` runs the proxy over the real Clerk middleware:
  - a genuine expired session token in the header, and each of `ak_`, `mt_` and `oat_`, get a 401 with no call to Clerk;
  - the same token in the session cookie still reaches Clerk's refresh, which shows the harness reaches Clerk.

  All four refusal cases failed on the previous `proxy.ts`.
- [x] **The firewall, 2026-10-24.** These all got 403:
  - with the header: `/`, `/pricing` (no scheme) and `/api/health`;
  - on the cron routes: `ak_`, `mt_` and `oat_` values and a JWT-shaped value;
  - on another `/api/cron/` path: an `ak_` value;
  - with the header, on `www`, the `vercel.app` alias and a deployment URL.

  Requests without the header got 200. A wrong, 64-hex secret on either cron route reached the route's own 401.
- [ ] In production, after release, two checks; due 2026-11-06.
  - A plain `Authorization` value on an unknown `/api/cron/` path, which the firewall rule lets through, gets the proxy's 401. On 2026-10-24, before the fix, Clerk ran and the route answered 404.
  - The next runs of both crons succeed.
- [ ] After those checks, remove the firewall rule and its row under Edge Rules; due 2026-11-06.
  *Re-dated 2026-10-30 from 2026-10-31:* the fix reaches production with the next promotion, which waits on the owner's last billing QA steps.

## Related

- BUG-323: the limiter this extends.
- DEBT-503: items 2 (the Clerk report), 3 (the failed-refresh alert) and 4 (counting verified refreshes).
