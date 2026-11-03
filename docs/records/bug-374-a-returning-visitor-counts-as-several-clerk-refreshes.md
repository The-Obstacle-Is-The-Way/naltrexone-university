# BUG-374: A Returning Visitor's Page Load Counts as Several Clerk Refreshes

**Status:** Verifying — a signed-in production check after the promotion that carries the fix; due 2026-11-06
**Priority:** P2
**Date:** 2026-11-03

---

## Summary

When a signed-in visitor comes back after their session token has expired, the first page load makes Clerk refresh the token once, on the server. The proxy's limiter (BUG-323, DEBT-503 item 4) then counts the page's next several requests as refreshes too, though Clerk makes none. Next's link prefetches send about a dozen requests within two seconds, so the per-session limit of 6 a minute refuses the rest with a 429.

The cause is in `expiredSessions` (`lib/clerk-backend-call-limit.ts`). A browser holds two session cookies: the plain `__session` and the suffixed `__session_<suffix>`. Clerk reads only one of them per request, chosen by its `usesSuffixedCookies()`. On a production instance, that is the suffixed one unless the plain one is newer. Clerk's server refresh asks Clerk's API for cookies in the form it reads (`suffixed_cookies`), and the evidence below shows the plain cookie left expired. It stays expired until Clerk's browser script rewrites both, a second or two later. `expiredSessions` counts a request when any `__session*` cookie has expired, so every request in that gap counts.

## Evidence

- **Production, 2026-11-03.** A signed-in check on deployment `dpl_Fb4Dib2BBbNPFwSGjZNS3Jdq2ckn` (main 518f94c7) loaded `/app/dashboard` at 02:08:36Z and `/app/practice` at 02:12:54Z, each after both session tokens had expired. In both loads, the visitor stayed signed in, and no handshake redirect happened. The suffixed token was reissued at 02:08:36Z, so the first load refreshed on the server. Vercel's request log then shows the document, the redirect to `/pricing` and the first prefetches passing. It shows 429s from the proxy for the rest: 4 at 02:08:38Z and 5 at 02:12:55Z. The runtime log has one `clerk_backend_call_refused` line, with `limit: 'signed-in-session'`, for each. The `/app/bookmarks` load at 02:12:58Z, in the same minute as the 02:12:55Z refusals, had none. The session's bucket was still full, so its requests no longer counted: by then the expired cookie had been rewritten.
- **Clerk's code, `@clerk/backend` 3.25.0.** `AuthenticateContext.initCookieValues` reads the session token through `getSuffixedOrUnSuffixedCookie`, so it reads one cookie. It reads the refresh token only from `__refresh_<suffix>`. `refreshToken` calls `sessions.refreshSession` with `suffixed_cookies: usesSuffixedCookies()`, and `attemptRefresh` sets the cookies that call returns.
- **Reproduced against the installed SDK.** In `lib/clerk-backend-call-limit-sdk.test.ts`, Clerk's real middleware gets an expired plain token beside a current suffixed one, both signed with the instance's key. It makes no Backend API call, and the limiter counts the request in the signed-in-session, signed-in-address and site buckets.
- **Inferred, not observed.** That the refresh left the plain cookie expired, and that the requests which passed made no Backend API call. The check did not read the plain token's issue time or the refresh's `Set-Cookie` names. But the refresh rewrote the suffixed token, Clerk then reads the suffixed one, and the plain cookie is the only other cookie `expiredSessions` reads.

## Impact

- **A returning visitor can get the 429 page.** It needs a click inside the gap of a second or two after Clerk's refresh, while the session's bucket is full. A refused client-side navigation falls back to a full page load, which then gets the "Too many sign-in checks came from your network" page. In the check, only prefetches were refused, so the visitor saw nothing.
- **Shared networks have about a sixth of their intended headroom.** Each falsely counted request that the session's bucket lets through also counts in the signed-in-address bucket (200 a minute) and the site-wide bucket (1,000 a minute). One return costs Clerk one refresh but counts up to 6. So about 33 returning visitors a minute behind one address fill the bucket DEBT-503 item 4 sized for 200. That is the hospital-network case item 4 exists for, and it raises `clerk_signed_in_limit_reached`.
- **DEBT-503 item 4's measurement overcounts.** The `clerk_backend_call_usage` rows the owner reads by 2026-11-08 count these requests. They overstate signed-in refreshes until this fix is in production.

## Options

1. **Skip only a request whose current suffixed token Clerk reads.** A request counts as today unless all of these hold:
   - It carries the plain `__session` and the suffixed `__session_<suffix>`, both non-empty. The suffix is the one Clerk derives from the publishable key.
   - Clerk signed both tokens, and the plain one names an issuer. Every segment of both is canonical unpadded base64url. Node then decodes them as Clerk's stricter decoder does: a token Node reads loosely but Clerk cannot read would otherwise change Clerk's choice.
   - Clerk's rule reads the suffixed token. That needs a non-empty `__client_uat_<suffix>`, and then one of:
     - it is "0" and `__client_uat` is "0";
     - it is not "0", and the plain token was not issued strictly later while `__client_uat` is not "0".
   - The suffixed token has not expired, within Clerk's five seconds of clock skew.
   - The request carries no `Authorization` header. Clerk also refreshes a token sent there, and the proxy refuses that header before the limiter (BUG-369), but the exception does not rely on that.

   Clerk refreshes only an expired token it reads, so such a request costs it nothing. The one part of Clerk's rule left out, whether the plain token's issuer is this instance's, can only move its choice to the suffixed token, so leaving it out cannot under-count. A current plain token beside an expired suffixed one keeps counting: no check has seen it, and deciding it needs that instance check. Real-SDK cases pin each condition, so a Clerk upgrade that changes the rule fails the tests.
2. **Mirror Clerk's whole choice.** Count a request only if the token Clerk reads has expired. Clerk itself chooses by claims the sender picks, so an exact mirror cannot under-count, and it covers the reverse case too. But it also needs the instance's frontend API from the publishable key, and it replaces the limiter's reading of every request, where option 1 changes only the case seen in production.
3. **Raise the per-session limit.** This hides the refusals. The sixfold overcount stays in the shared-network and site buckets and in the measurement.
4. **Leave prefetches uncounted.** The sender chooses the headers that mark a prefetch, and a prefetch that does refresh costs Clerk the same.
5. **Make the refresh rewrite both cookies.** The proxy would copy the refreshed token into the plain cookie. That writes Clerk's cookies behind its back, and Clerk's browser script owns them.

## Resolution (decided)

Option 1, decided 2026-11-03 under the owner's standing delegation, after a second agent's challenge: it found that the first draft of this option read claims the way Node does rather than the way Clerk does, and missed the exact suffix and empty cookies. Each now has a condition above. It removes the overcount the check saw and changes nothing for a token Clerk did not sign. An adversarial review of the fix found no request on which Clerk calls its Backend API while the limiter counts nothing, as the proxy is wired. On its advice, the exception also requires no `Authorization` header, and the proxy hands Clerk's middleware the same publishable key the limiter reads, so the two cannot derive different suffixes.

## Verification

- [x] Red first: the real-SDK reproduction above failed before the fix, on what the limiter counted, and passes after it.
- [x] Each condition of option 1 has a real-SDK case in `lib/clerk-backend-call-limit-sdk.test.ts`, including a token Node reads but Clerk cannot, a decoy suffix and an empty `__client_uat_<suffix>`: wherever Clerk refreshes, the limiter counts. Two cases pin what still counts though Clerk calls nothing: a suffixed token Clerk did not sign, and the reverse gap. A decision table of 1,344 cookie combinations checks that wherever Clerk calls its Backend API, the limiter counts. With any one of three conditions broken on purpose, it failed, naming the shapes.
- [x] Rechecked on 2026-11-03 against `@clerk/backend` 3.26.2 and `@clerk/shared` 4.41.1, which #1629 installed. `usesSuffixedCookies`, the cookie reads and `getCookieSuffix` are unchanged. The bundle's one logic change rejects a handshake token whose category is not a session token's, and the limiter counts a handshake as before. The real-SDK cases and the decision table pass on the new versions.
- [ ] After the promotion that carries the fix, a signed-in production check reloads `/app/dashboard` after both tokens have expired. It logs no `clerk_backend_call_refused` line, and the log shows no 429 from the proxy. If the check can see them, it records the refreshing response's `Set-Cookie` names, never values.

## Related

- BUG-323: the limiter this corrects.
- DEBT-503 item 4: the signed-in buckets, and the measurement this overcount affects.
