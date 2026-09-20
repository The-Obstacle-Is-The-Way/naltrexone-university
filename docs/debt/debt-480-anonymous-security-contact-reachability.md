# DEBT-480: The Published Security Contact Is Not Reachable Anonymously

**Status:** Open
**Priority:** P2
**Date:** 2026-09-20

---

## Description

**CONFIRMED:** `public/.well-known/security.txt` exists, but its canonical production URL is intercepted by Clerk. Fresh signed-out GETs on 2026-09-20 returned 404 with `Accept: */*` and `x-clerk-auth-reason: protect-rewrite`; `Accept: text/html` returned 307 to the identity host. [Commands and outputs](./assets/adversarial-2026-09-20/review.md#http-receipts).

`proxy.ts:196-201` protects paths absent from `lib/public-routes.ts:3-15`. The matcher at `proxy.ts:246` does not skip TXT; neither public list nor matcher admits this resource. `tests/security-txt.test.ts:5-24` says it “publishes” the contact but only reads the local file and validates fields/expiry. That test passed during this review, alongside the production failure.

This is not the expiry-warning work already owned by DEBT-475 or a request to change vulnerability-reporting channels. The contact file was originally added under resolved DEBT-100; anonymous HTTP access is the unfiled defect.

## Impact

**CONFIRMED:** an unauthenticated disclosure client cannot obtain the file at the canonical URL with the tested request forms. **UNPROVEN:** missed reports or exploitation; no such incident was observed. GitHub's separate security policy/reporting entry remains available, so “no reporting channel” would be overstated.

## Resolution

One narrow PR: expose **only** `/.well-known/security.txt` through the shared public-resource/auth boundary. Keep protected app routes and adjacent/prefix-lookalike paths protected; do not exempt all `.txt`, all `.well-known/*`, or the app tree. Keep the current content and hard expiry test. Align with DEBT-479's later metadata resource policy without making this fix wait for SEO.

## Verification

Red first: a built-app signed-out GET test for both Accept forms must fail against the current tree (observed 404/307), requiring status 200, `text/plain` content type and the intended contact/canonical fields. Add a focused real proxy/matcher test whose current-tree outcome is `auth.protect()` for the exact path. After the fix, deleting the exact public exemption must make both access checks fail; exempting a prefix-lookalike or `/app/dashboard` must fail the negative boundary assertions. Avoid a mock that hard-codes the desired route classification.

After ordinary full gates/review/promotion, repeat anonymous production GETs and preserve body/header receipts. Local file content, a green expiry test or a Ready build is not publication proof. No runtime fix was made in this docs-only filing.

## Related

- [Adjudication and HTTP receipts](./assets/adversarial-2026-09-20/review.md)
- [DEBT-479](./debt-479-public-surface-discoverability-and-field-performance.md) — crawl/image resources need the same auth-boundary reasoning
- [DEBT-475](./debt-475-toolchain-coherence.md) — existing expiry warning/hard expiry work, unchanged
- `public/.well-known/security.txt`, `tests/security-txt.test.ts`, `lib/public-routes.ts`, `proxy.ts`
