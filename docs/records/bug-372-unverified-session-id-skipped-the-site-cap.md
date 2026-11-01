# BUG-372: An Unverified Session ID the Key Column Could Not Hold Skipped the Clerk Limiter's Site-Wide Cap

**Status:** Verifying — every check is recorded below; the next pull request touching this folder closes it; due 2026-11-02
**Priority:** P2
**Date:** 2026-11-01

---

## Summary

BUG-323's limiter (`lib/clerk-backend-call-limit.ts`) counts each request that makes Clerk call its Backend API per address, then per session, then site-wide.
- **The per-session key.** On a GET, for an expired `__session*` token alongside a `__refresh_*` cookie, the key was `clerk-backend-call:session:<sid>`. The first such session found keyed the bucket.
- **The claim.** `<sid>` was the token's `sid` claim as sent. A token Clerk did not sign, checked or not, counts in these unsigned buckets, keyed by that claim.
- **The column.** `rate_limits.key` is `varchar(255)`, and Postgres text holds no NUL.
- **What failed.** A `sid` longer than 228 characters (255 less the 27-character prefix), unless the excess was all spaces, or one holding U+0000, failed the limiter's insert.
- **The fail-open.** `limitClerkBackendCalls` lets a request through when the limiter fails, a deliberate BUG-323 choice for database outages. The site bucket comes last, and the loop stops at the first error, so such a request was never counted site-wide.

A request carrying a Clerk handshake nonce costs Clerk a Backend API lookup; a forged session token alone costs nothing while `CLERK_JWT_KEY` is set. So the expensive form was:
- a handshake nonce;
- a forged expired session token with such a `sid`;
- a refresh cookie.

Each one counted per address, at 30 a minute in the proxy and 30 a minute in BUG-323's edge rule. It skipped the 1,000-a-minute site-wide cap, which is what protects Clerk's allowance from a sender rotating addresses.

Found on 2026-11-01 by a second agent's pre-review sweep of DEBT-503 item 4's step 1. It was confirmed by reading the code and by a reproduction test, and kept private until the fix was in production and the owner approved disclosure the same day.

## Evidence

- **The key column.** Inserting a 256-character key into `rate_limits` fails with "value too long for type character varying(255)". Postgres text cannot store NUL.
- **The parse.** `expiredSessions` keyed a session by `typeof payload.sid === 'string' ? payload.sid : 'unknown'`, with no bound.
- **The fail-open.** `limitClerkBackendCalls` catches any limiter error, reports `clerk_backend_call_limiter_failed` and returns `null`, so the request goes on to Clerk.
- **Reproduced before the fix,** on Postgres with the real limiter: `tests/integration/clerk-backend-call-limit.integration.test.ts`.
  - The request was a GET with a handshake nonce, a forged expired `__session` and a refresh cookie, with a 300-character `sid` or one holding a NUL.
  - Before the fix it reported a limiter failure, and so went through uncounted site-wide by the bucket order above.

## Impact

- **No harm seen,** within what can still be checked.
  - The raw-`sid` key reached production with promotion #1386, about 2026-10-06. Before the first live sale, no subscriber was exposed.
  - Sentry's server project holds no `clerk_backend_call_limiter_failed` alert, read on 2026-11-01 by its `alert.kind` tag. The same search finds the drill of 2026-10-09.
  - That alert has existed since 2026-10-08. Before then, a limiter failure was only logged, and production keeps runtime logs for an hour, so those days cannot be checked.
- **What a sender could have done.** Clerk's production allowance is 1,000 calls per 10 seconds, about 6,000 a minute. At 30 handshakes a minute per address:
  - about 34 addresses could empty one 10-second window;
  - about 200 could hold it empty.
  - While it lasted, returning visitors would have been signed out and new users not provisioned. Open tabs with a valid token are unaffected.
  - With the site-wide cap working, the same sender would only have made returning visitors wait a minute (DEBT-503).
- **Signals.** Our limiter's only signal was `clerk_backend_call_limiter_failed`, which reads as a database failure. A sender could choose cookies that trip no other alert.

## Options

1. **Contain at the edge first, then fix publicly**, as with BUG-369 and DEBT-503's cookie gap. The Hobby plan's three firewall rules were all in use. A rule matching an over-long session cookie by its length could also refuse real tokens.
2. **Ship the fix in a neutral pull request, promote it promptly, then disclose.** Chosen by the owner.
3. **Hold everything private** until the owner reviewed it.

## Resolution (decided)

#1617 fixed it in two layers, either of which closes the path alone.

1. **Where the claim is read** (`sessionKeyId`):
   - A session ID matching `/^[A-Za-z0-9_]{1,64}$/` (ASCII letters, digits or underscores, up to 64 characters, as Clerk's own are) keys its session as it is.
   - Any other string is keyed by `sha256:` and the base64url SHA-256 digest of its UTF-8 bytes, a form no allowlisted ID can take.
   - A `sid` that is not a string still keys as `unknown`.
2. **Where keys are stored** (`DrizzleRateLimiter`). A key is stored as it is only when the column holds it exactly. Any other key is stored as its head, `#sha256:` and the SHA-256 digest of its UTF-16 code units, so every key counts and keys that differ count apart.
   - **The head** is its first 204 UTF-16 units (255 less the 8-character marker and the 43-character digest). In the head, NUL and lone surrogates, including a pair split at the cut, are written as U+FFFD.
   - **A key goes to the stored form** when it:
     - is over 255 characters, counted by code point;
     - holds a NUL or a lone surrogate;
     - contains the marker.

ADR-016's amendment of 2026-11-01 records both rules. The approach follows OWASP's Input Validation Cheat Sheet: validate at the trust boundary, against an allowlist and a maximum length. It also treats a token's claims as the sender's until its signature is verified.

**Not changed, and why:**
- **A real database error still fails open,** and `clerk_backend_call_limiter_failed` still fires. Examples are the five-second lock timeout on the busy site row, or a full connection pool of ten. That was BUG-323's availability choice, and input can no longer reach it.
- **A forged token naming another session's ID** counts in that ID's unsigned per-session bucket, at six a minute.
  - While `CLERK_JWT_KEY` is set, as in production, a genuine refresh counts in its signed bucket, so it is never refused this way.
  - A genuine handshake return, which skips the signature check, still counts in the unsigned bucket. A sender who knew a session's ID could make that return wait up to a minute.

## Verification

- [x] **Red first, on Postgres.** The reproduction test reported a limiter failure before the fix. With the fix, it counts the request per address, per session under the digest key, and site-wide, with no failure. It passed against the merged code on 2026-11-01.
- [x] **Each layer is pinned by its own tests.**
  - `proxy-clerk-session-key.test.ts` covers the session ID's allowlist, digest and non-string forms, and the 64- and 65-character boundary.
  - The storage block in `tests/integration/rate-limiter-guards.integration.test.ts` covers lengths, NUL, lone surrogates, splits outside the BMP, the reserved form and keys that differ.
  - Reverting either layer fails its own tests. With only the storage layer reverted, the reproduction test still passes. With only the session-ID layer reverted, no write fails, but the test fails on the session key it names.
- [x] **An independent adversarial review** found no input that still makes a limiter write fail. It tried:
  - lengths at and past the column;
  - NUL in several positions;
  - lone surrogates;
  - characters outside the BMP;
  - non-string claims;
  - a 1 MB cookie header.
- [x] **Review and release.** #1617 passed five CodeRabbit rounds, and the full gate with E2E on each head. Promote #1619 released it on 2026-11-01, and production health answered 200 afterwards.

## Related

- BUG-323: the limiter, its per-session limit, and its fail-open choice.
- DEBT-503: item 4 (the signature check and the signed-in buckets), and step 1's sweep, which found this.
- BUG-369: the earlier finding on the same allowance, contained at the edge before disclosure.
