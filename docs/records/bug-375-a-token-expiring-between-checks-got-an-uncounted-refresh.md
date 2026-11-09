# BUG-375: A Session Token That Expired Between the Limiter's Check and Clerk's Got an Uncounted Refresh

**Status:** Verifying — every check is recorded below; its disclosure pull request closes it; due 2026-11-09
**Priority:** P3
**Date:** 2026-11-03

---

## Summary

BUG-323's limiter (`lib/clerk-backend-call-limit.ts`) predicts, before Clerk's middleware runs, whether a GET will make Clerk refresh a session. It read the clock for that prediction, and Clerk read it again when it verified the token.
- **The rule both apply.** A token is expired once the clock passes its `exp` plus Clerk's five seconds of skew. The limiter's `hasExpired` and Clerk's `assertExpirationClaim` compare the same boundary.
- **The gap.** Between the two clock reads, Clerk checks the token's signature with two awaited WebCrypto steps. On a server instance's first request, the proxy also awaits its lazy import of Clerk's middleware. Without `CLERK_JWT_KEY`, which production sets, Clerk's signing-key fetch can also fall in the gap, once every five minutes per instance. A token that crossed the boundary in the gap read as current to the limiter and as expired to Clerk.
- **What happened.** The limiter counted nothing. On a plain token, `triggersClerkBackendCall` returned false and the limiter was never called. With BUG-374's exception, `bucketsFor`'s own clock read found a current suffixed token. Either way, Clerk then refreshed the session through its Backend API, uncounted in every bucket, the site-wide one included.

**Introduced by DEBT-503 item 4, step 2,** built on 2026-10-24 in #1607. It changed the limiter's test from `exp <= now` to `exp + 5 <= now`, since Clerk does not refresh a token within its skew. Promotion #1619 released it on 2026-11-01. Before that, the limiter counted a token from its own `exp`, five seconds ahead of Clerk, which covered any gap shorter than that. BUG-374 does not widen it: its exception applies the same `hasExpired` to the suffixed token.

**Fixed** by #1634 and #1643, released through Promote #1642 on 2026-11-04: a GET the limiter did not count reaches Clerk without its refresh cookies, so Clerk refreshes only what the limiter counted (DEBT-503 item 4, step 4).

Found on 2026-11-03 by the adversarial reviewer of BUG-374's fix. It was reproduced and privately challenged the same day, and kept private under the records rule for exploitable security findings until its fix was in production. The owner approved disclosure on 2026-11-09.

## Evidence

- **The same boundary.** `hasExpired(exp, now)` is `exp + 5 <= floor(Date.now() / 1000)`. Clerk's `assertExpirationClaim` in `@clerk/backend` 3.26.2 is `exp * 1000 <= Date.now() - 5000`. Both flip at the same instant, because `exp` is a whole number of seconds. So the only difference is when each reads the clock.
- **The reads.** `proxy.ts` calls `triggersClerkBackendCall(request)`, which reads the clock. Only when that returns true does it call the limiter, whose `bucketsFor` reads the clock again, synchronously, before any await.
  - The first read governs a plain token. The second governs BUG-374's exception, since the trigger does not apply the exception.
  - A later read can only turn current into expired, so it cannot open a second gap.
  - Next, the proxy awaits `getClerkMiddleware()` and runs Clerk's middleware. Clerk decodes the token, checks its signature, then its expiry.
- **No other clock decision diverges.**
  - Clerk refreshes only on `TokenExpired`, which it checks before `nbf` and `iat`.
  - On a production instance, a future `nbf` or `iat` leads to a handshake redirect. That costs no Backend API call, and the nonce it returns with always counts.
  - Clerk's wider clock tolerance applies to development instances only.
  - The private challenge confirmed these with the real SDK.
- **Reproduced against the installed SDK,** with the real Clerk middleware and a generated signing key, the real limiter with the repository's fake rate limiter, and Clerk's Backend API stubbed.
  - With the clock 1 ms short of the boundary for the limiter and at the boundary for Clerk, Clerk called `/v1/sessions/sess_sdk/refresh` and the limiter counted nothing.
  - This held for a plain token, and for a returning visitor whose suffixed token BUG-374's exception read as current.
  - The reproduction joins `lib/clerk-backend-call-limit-sdk.test.ts` with its disclosure, beside the fix's expectations.
- **The gap measured locally,** in the same harness, without the stubbed clock: about 3.4 ms after the module registry is reset (the test runner's caches stay warm, so this is not a true cold start), and about 0.5 to 1 ms warm: over 200 warm runs, p50 was 0.51 ms, p99 1.19 ms and the maximum 2.85 ms. These are upper bounds: the harness timed from before the limiter's check to Clerk's first Backend API call, so they include the limiter's own awaits.
- **Not measured:** the gap on Vercel, on a real cold start, or under concurrent load.

## Impact

- **Who could use it.** Anyone with a genuine session: a free sign-up is enough, since Clerk must have signed the token. It cannot be aimed at another user's session.
- **What it cost.**
  - **Per request:** each hit is one Backend API call that no bucket counts, and Clerk's rate limit counts calls, whatever their outcome.
  - **Boundaries:** `exp` is in whole seconds, so boundaries fall on whole seconds, and one fresh token a second from Clerk's Frontend API, which spends nothing from the Backend API allowance, keeps one at hand.
  - **The rate:** for evenly spread traffic, uncounted calls per second are roughly request rate × gap. At a 1 ms gap, about 100,000 requests a second would buy 100 calls a second, Clerk's documented 1,000 calls per 10 seconds.
  - **Timing does better.** A sender can read `exp` from its own token and aim a burst at the boundary. Network jitter of a few milliseconds, not the gap, then limits its hits, and a request that lands early costs it nothing. That rate was not measured.
  - **No edge bound:** no firewall rule bounds refresh-shaped GETs; the only one covers handshake nonces.
  - **Unknown:** how far concurrent load widens the gap.
- **What it threatened.** The shared allowance, DEBT-503's single point of failure: if Clerk refuses our calls, every signed-in visitor whose token needs a refresh is signed out. No data was exposed.
- **Seen in production: our signals could not tell.** An uncounted call never reached the limiter, so neither its refusal log nor its alerts could show one. Only Clerk refusing our calls (DEBT-503 item 3's `clerk_backend_calls_refused`), or Clerk's usage dashboard, could. Neither showed anything unusual. With no live sale yet, no subscriber was exposed.
- **Why P3.** Each uncounted call needed a genuine account's token at its expiry boundary, the site-wide cap still counted every other refresh, no data was exposed, and with no live sale no subscriber could be signed out.

## Options

1. **Count from `exp`, without Clerk's skew** (a revert of step 2's skew). `hasExpired` drops the five seconds for counting only. A token then counts from its own `exp`, five seconds before Clerk would refresh it, so the gap must exceed five seconds to matter. It can only count more than before, on every path.
   - **Cost:** a token in its last five seconds before Clerk's boundary counts, though Clerk accepts it with no refresh and sets no new cookie.
     - An active tab never sends one. Clerk's browser SDK refreshes in the background about 17 seconds before `exp`, polling every 5 seconds (1.5 seconds when focused), on worker timers that keep running in a hidden tab. That is per Clerk's current `tokenCache.ts`; the browser loads clerk-js by version selector, so the deployed version is not pinned or verified.
     - Only a tab suspended past its refresh, such as by sleep or mobile backgrounding, that resumes inside those five seconds can send one.
     - If it sends six or more requests in that band, such as a navigation and its prefetches, it fills its own per-session bucket (6 a minute). If clerk-js has not refreshed by Clerk's boundary, a later request needing a real refresh within the minute gets the proxy's 429, for up to 60 seconds.
     - That is rare and unmeasured. The same burst past the boundary already counted, so the exposure is five more seconds per token. It cannot realistically fill an address's signed-in bucket (200 a minute).
2. **A smaller margin,** such as one second. The band, and so the cost above, shrinks fivefold. But the number has no source, and a gap under load can outgrow it.
3. **Give Clerk a smaller skew** (`clockSkewInMs`). It moves Clerk's boundary instead of ours, so every visitor's token is refreshed earlier, and Clerk tolerates less drift from its issuer's clock.
4. **Import Clerk before the check.** It shrinks the gap on an instance's first request, but not the signature check or event-loop queueing. It narrows the window without closing it.
5. **Count at the call,** by wrapping the HTTP client Clerk's middleware uses. That would be exact, but Clerk exposes no seam for it. It would mean replacing `fetch`, and a refusal there would reach Clerk as a failed refresh, not the proxy's 429.
6. **A tripwire after the response.** When the limiter counted nothing but Clerk's answer shows a refresh, log it and charge the buckets. A refresh shows as session cookies set without a handshake nonce, or as a `session-token-expired-refresh-*` reason. This prevents nothing, since a racing request never consults the buckets. But it catches any drift between the limiter's copy of Clerk's logic and Clerk's, and makes "seen in production" answerable. It complements option 1.
7. **Bind Clerk's refresh to the limiter's count** (a time-of-check-to-time-of-use remedy). Clerk refreshes only an expired token on a GET that carries `__refresh_<suffix>`, which it reads from that cookie alone. So a GET the limiter did not count goes to Clerk without its `__refresh_*` cookies whenever a session token it carries is at or past its own `exp`. The limiter keeps Clerk's exact boundary, with no five-second band.
   - **If the token crosses Clerk's boundary in the gap,** Clerk cannot refresh. It takes its own path for an expired token without a refresh cookie: a handshake redirect for a page load, which costs no Backend API call, and whose return with a nonce always counts; for other requests, a signed-out answer.
   - **If it does not,** Clerk accepts the token and never reads the refresh cookie, so nothing changes.
   - **Monotone:** the strip test reads the clock after the count's, and "at or past `exp`" only grows true, so it covers every token the count saw as current but Clerk may see as expired, for any gap under five seconds.
   - **Unchanged:** counted requests, refused requests (Clerk never runs), and the limiter's fail-open on a database failure keep their cookies.
   - **Cost:** only a request whose token crosses Clerk's boundary in the milliseconds of the gap loses its server refresh, and is sent through a handshake instead. No request is counted that Clerk does not refresh, so the band's per-session risk in option 1 is gone.
   - **Risk to check:** the proxy hands Clerk a modified request. The strip must remove exactly the pairs Clerk's parser reads as `__refresh_*`, leaving every other byte unchanged. It must also not change what the app downstream sees.

## Resolution (decided)

- **Option 7, unconditional,** as the second private challenge advised on 2026-11-03: in production, a GET the limiter did not count reaches Clerk without its `__refresh_*` cookies, with no clock condition, so any gap is covered, load included, and any drift in BUG-374's mirror too. The limiter keeps Clerk's exact boundary. Option 1 was built first and set aside: a resumed tab's seventh request in its five-second band would have been refused itself.
  - **The strip:** cut at Clerk's own pair boundaries (shared tokenizer `cookiePairs`), every other byte kept, then re-parsed; if a refresh cookie still reads, Clerk gets no cookies. Rebuilding from the decoded parse was rejected: a percent-encoded pair would come back as a real one.
  - **The verdict:** `countClerkBackendCalls` returns counted, uncounted or failed-open, so BUG-374's exception is stripped and the fail-open keeps its cookies.
  - **GET only:** Clerk refreshes only on a GET, and copying other requests risks their bodies.
  - **Light tripwire:** the proxy logs `clerk_refresh_withheld` when Clerk answers a stripped request with `non-eligible-no-refresh-cookie`. That answers "seen in production", so option 6's full tripwire is not needed.
- **Release.** #1634 shipped the fix under a neutral description, the owner's choice on 2026-11-03, and #1643 fixed the adversarial review's low findings. Promote #1642 released both on 2026-11-04. The owner approved disclosure on 2026-11-09, and its disclosure pull request publishes this record and the reproduction.

## Verification

- [x] **The reproduction,** in the proxy's order (count, then withhold, then Clerk), for gaps of 1 ms, 4.9 s and a minute on a plain token, and 1 ms on BUG-374's suffixed token: the limiter counts nothing and Clerk calls nothing. Handed the refresh cookie, as before the fix, Clerk refreshes both 1 ms cases uncounted. It joins `lib/clerk-backend-call-limit-sdk.test.ts` with its disclosure. In every fixed case Clerk wanted the refresh it was not handed, so each crosses the boundary, and a strip that returns the request unchanged fails all four.
- [x] **Public tests, red first where new behavior:** the proxy's strip and log (`proxy-clerk-refresh-cookie.test.ts`, 2 red then green; 4 guards green throughout); the strip and the verdict (`lib/clerk-backend-call-limit-refresh.test.ts`, red then green, with a 2,000-header property check); and real-SDK cases (`lib/clerk-backend-call-limit-sdk.test.ts`) showing no Backend API call for an expired token without the cookie in five header shapes, a handshake for a page load, signed out for a router request, and a current session read as before. Breaking the strip's name check failed 15 tests.
- [x] **Full gate and CI** on #1634 and its follow-up #1643, each with a full local gate, CI's E2E smoke and CodeRabbit's exact-head approval.
- [x] **Adversarial review of the built code** (2026-11-04, private): no defect in the production path. Checked against Clerk's source and a real-SDK run:
  - no Set-Cookie clears the refresh or session cookies when the refresh cookie is withheld;
  - the strip matches Clerk's parser, with a fuzz of 100k headers;
  - Clerk refreshes only on GET;
  - the copied request keeps what Clerk and Next rely on.
  Its four low findings and one nit (docs and tests) were fixed in #1643, which the same reviewer re-checked.
- [x] **Released** through Promote #1642 on 2026-11-04: `main` and `dev` held the same tree, and production health answered 200.
- [x] **After release,** the same morning: signed-in browsing and a full dashboard load after 3m23s on `/api/health` all answered 200 and stayed signed in. There were 0 `clerk_refresh_withheld`, 0 `clerk_refresh_cookie_strip_failed`, 0 `clerk_backend_call_refused`, 0 `clerk_backend_call_failed` and 0 runtime errors, and the log reader returned other lines in the same window.
  - **Ruled out:** this change's withhold (no `clerk_refresh_withheld`) and a failed refresh (no `clerk_backend_call_failed`).
  - **Not determinable from production signals:** whether that load refreshed on the server. The token may still have been current, because another tab kept it fresh; the server may have made a counted refresh, which logs nothing on success; or a handshake may have run, if the browser carried no refresh cookie at all. The usage rows keep a daily count per bucket, not the minute. What visitors need held: the load stayed signed in, and nothing was refused or failed. The real-SDK tests above prove the counting.

## Related

- BUG-323: the limiter.
- DEBT-503: the shared allowance, and item 4's signed-in buckets, whose step 2 introduced this and whose step 4 fixed it.
- BUG-374: the exception that shares `hasExpired`.
- BUG-372: the precedent for private handling and a neutral fix PR.
