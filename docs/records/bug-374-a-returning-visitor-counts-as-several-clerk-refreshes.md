# BUG-374: A Returning Visitor's Page Load Counts as Several Clerk Refreshes

**Status:** Open — fix test-first: count only the session token Clerk reads; due 2026-11-05
**Priority:** P2
**Date:** 2026-11-03

---

## Summary

When a signed-in visitor comes back after their session token has expired, the first page load makes Clerk refresh the token once, on the server. The proxy's limiter (BUG-323, DEBT-503 item 4) then counts the page's next several requests as refreshes too, though Clerk makes none. Next's link prefetches send about a dozen requests within two seconds, so the per-session limit of 6 a minute refuses the rest with a 429.

The cause is in `expiredSessions` (`lib/clerk-backend-call-limit.ts`). A browser holds two session cookies: the plain `__session` and the suffixed `__session_<suffix>`. Clerk reads only one of them per request, chosen by its `usesSuffixedCookies()`. On a production instance, that is the suffixed one when it is the newer token. Clerk's server refresh asks for cookies in the same form (`suffixed_cookies`), so it rewrites only the cookie it reads. The plain cookie stays expired until Clerk's browser script rewrites both, a second or two later. `expiredSessions` counts a request when any `__session*` cookie has expired, so every request in that gap counts.

## Evidence

- **Production, 2026-11-03.** A signed-in check on deployment `dpl_Fb4Dib2BBbNPFwSGjZNS3Jdq2ckn` (main 518f94c7) loaded `/app/dashboard` at 02:08:36Z and `/app/practice` at 02:12:54Z, each after both session tokens had expired. In both loads, the visitor stayed signed in, and no handshake redirect happened. The suffixed token was reissued at 02:08:36Z, so the first load refreshed on the server. Vercel's request log then shows the document, the redirect to `/pricing` and the first prefetches passing. It shows 429s from the proxy for the rest: 4 at 02:08:38Z and 5 at 02:12:55Z. The runtime log has one `clerk_backend_call_refused` line, with `limit: 'signed-in-session'`, for each. Loads of `/app/bookmarks` and `/app/billing` a few seconds later had no refusals.
- **Clerk's code, `@clerk/backend` 3.25.0.** `AuthenticateContext.initCookieValues` reads the session token through `getSuffixedOrUnSuffixedCookie`, so it reads one cookie. It reads the refresh token only from `__refresh_<suffix>`. `refreshToken` calls `sessions.refreshSession` with `suffixed_cookies: usesSuffixedCookies()`, and `attemptRefresh` sets the cookies that call returns.
- **Reproduced against the installed SDK.** In `lib/clerk-backend-call-limit-sdk.test.ts`, Clerk's real middleware gets an expired plain token beside a current suffixed one, both signed with the instance's key. It makes no Backend API call, and the limiter counts the request in the signed-in-session, signed-in-address and site buckets.
- **Inferred, not observed.** That the refresh left the plain cookie expired. The check did not read the plain token's issue time. But the refresh rewrote the suffixed token, Clerk then reads the suffixed one, and the plain cookie is the only other cookie `expiredSessions` reads.

## Impact

- **A returning visitor can get the 429 page.** It needs a click inside the gap of a second or two after Clerk's refresh, while the session's bucket is full. A refused client navigation falls back to a full page load, which then gets the "Too many sign-in checks came from your network" page. In the check, only prefetches were refused, so the visitor saw nothing.
- **Shared networks have about a sixth of their intended headroom.** Each falsely counted request also counts in the signed-in-address bucket (200 a minute) and the site-wide bucket (1,000 a minute). One return costs Clerk one refresh but counts up to 6. So about 33 returning visitors a minute behind one address fill the bucket DEBT-503 item 4 sized for 200. That is the hospital-network case item 4 exists for, and it raises `clerk_signed_in_limit_reached`.
- **DEBT-503 item 4's measurement overcounts.** The `clerk_backend_call_usage` rows the owner reads by 2026-11-08 count these requests. They overstate signed-in refreshes until this fix is in production.

## Options

1. **Follow Clerk's choice when Clerk signed both tokens.** When a request carries a plain and a suffixed session token and both verify with Clerk's key, apply Clerk's production-instance rule for which one it reads. Then count the request only if that token has expired. Clerk reads the suffixed token unless one of these holds:
   - its `__client_uat_<suffix>` is missing;
   - its `__client_uat_<suffix>` is "0" while `__client_uat` isn't;
   - the plain token is newer and neither `__client_uat` cookie is "0".

   Every other request counts as today. Once both tokens are known to be Clerk's, the two checks that read the plain token's claims, its issuer and its instance, are already settled. So the rest of the rule reads only the `__client_uat` cookies and the tokens' issue times, the same inputs Clerk reads. Real-SDK cases pin each branch, so a Clerk upgrade that changes the rule fails the tests.
2. **Mirror Clerk's whole choice, forged tokens included.** This is exact for every cookie header. But its first two branches read a plain token's issuer and instance before anyone has checked the token, so they depend on claims the sender chooses, for no benefit to any genuine visitor.
3. **Raise the per-session limit.** This hides the refusals. The sixfold overcount stays in the shared-network and site buckets and in the measurement.
4. **Leave prefetches uncounted.** The sender chooses the headers that mark a prefetch, and a prefetch that does refresh costs Clerk the same.
5. **Make the refresh rewrite both cookies.** The proxy would copy the refreshed token into the plain cookie. That writes Clerk's cookies behind its back, and Clerk's browser script owns them.

## Resolution (decided)

Option 1, decided 2026-11-03 under the owner's standing delegation. It removes the overcount for every genuine visitor and changes nothing for a token Clerk did not sign.

## Verification

- [ ] Red first: the real-SDK reproduction above fails before the fix and passes after it.
- [ ] Each branch of Clerk's choice has a real-SDK case: Clerk refreshes exactly when the limiter counts.
- [ ] After the promotion that carries the fix, a signed-in production check reloads `/app/dashboard` after both tokens have expired. It logs no `clerk_backend_call_refused` line, and the log shows no 429 from the proxy.

## Related

- BUG-323: the limiter this corrects.
- DEBT-503 item 4: the signed-in buckets, and the measurement this overcount affects.
