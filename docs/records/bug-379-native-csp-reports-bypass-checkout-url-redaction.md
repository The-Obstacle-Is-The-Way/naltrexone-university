# BUG-379: Native CSP Reports Bypass Checkout URL Redaction

**Status:** In Progress — prevent checkout identifiers in native CSP reports, then verify the deployed headers; due 2026-11-22
**Priority:** P2
**Date:** 2026-11-15

---

## Summary

Browser-native CSP reports go directly to Sentry's security endpoint. They bypass the SDK's `beforeSend` redaction and include the document URL and referrer. A stored Preview report contains a Checkout Session identifier in `document_uri`. BUG-378 reduced ordinary reporting volume; it did not change this collection boundary.

## Evidence

- `lib/content-security-policy.ts` adds `report-uri`, `report-to` and `Reporting-Endpoints`; `proxy.ts` attaches them to Clerk's responses. `lib/sentry-data-collection.ts:redactCredentialParams` redacts session query parameters only in SDK events.
- `src/adapters/controllers/billing-controller.ts:toTrialPaymentMethodReturnUrl` includes the Checkout placeholder on the successful add-card return. `app/(app)/app/billing/page.tsx:BillingPageProps` reads `trial_payment_method` and `error`, never `session_id`. The saved-card state comes from the authenticated account's stored subscription, not this query parameter.
- `/checkout/success` needs the identifier to retrieve the Session. `checkout-success-sync.tsx` validates its shape, requires Clerk authentication, rate-limits signed-in visits, and compares the retrieved subscription's `metadata.user_id` with the authenticated application's user ID before any persistence. The cross-account test in `checkout-success-sync-redirects.test.ts` requires no transaction and no entitlement grant. The public-route comment requires preserving the identifier through Clerk redirects.
- BUG-325's final record at commit `a8cb95d0fffba34f1977103933d666cff768456e`, item 3, confirms that another account's Session fails the ownership check. Item 5 rejects an SDK tunnel because it would turn direct-to-Sentry attack traffic into application function invocations.
- Stripe's [Session retrieve API](https://docs.stripe.com/api/checkout/sessions/retrieve) requires API authentication. The Session identifier is neither an API secret nor an app authentication token. No stored identifier was replayed against Stripe; this review does not claim a universal proof about Stripe-hosted Checkout's public UI.
- A read-only paginated scan of retained web-project event payloads is in progress. It includes resolved and archived issues and counts only `cs_test_` / `cs_live_` matches in native CSP `document_uri`, grouped by environment. Raw values are neither printed nor persisted. Final counts and the fixed observation window will replace this paragraph before push.

## Impact

Confirmed privacy/data-minimization defect, not a demonstrated account-takeover, payment authorization or entitlement bypass. Sentry's existing server-side scrubbing did not remove the identifier. The repository's deliberate redaction of credential query parameters should apply before delivery, even where an identifier alone grants no account access. Historic events remain stored under Sentry's retention rules; changing or deleting them needs the owner's separate approval.

## Options

1. Remove the unused add-card return identifier. This reduces collection at its source without changing how billing learns that a card was saved.
2. Clear checkout-success's address bar in client code after the server reads it. This shortens exposure but leaves a race: initial document scripts can report before hydration. A server redirect with a new cookie or server-side handoff could eliminate the URL, but introduces additional state, expiry and concurrent-tab behavior into payment recovery. Do not substitute a client cleanup for a pre-delivery boundary.
3. Omit native CSP delivery directives on responses whose URL or incoming referrer carries a credential query parameter, including encoded Clerk return URLs. Reuse the existing credential-parameter classification, preserve the policy and SDK error reporting, and set `Referrer-Policy: no-referrer` on those documents so the identifier does not follow into another page's report. Cost: these documents lose the native CSP tripwire. This is tied to request context, not build mode. Client-side history changes do not replace a document's CSP: owned payment return paths must remain document navigations, and the browser proof must cover that boundary.
4. Ask the owner for a Sentry advanced scrubbing rule, then prove it with a canary. Useful defense in depth, but outside code and ordinary tests, and existing server-side scrubbing has already missed this field. No settings change is authorized or performed.
5. Add an application endpoint that scrubs and forwards reports. This can retain the tripwire but creates an attacker-controlled function-invocation surface, the same cost boundary rejected for the SDK tunnel in BUG-325.
6. Accept the extra collection. Rejected: the add-card URL does not need it, and SDK event URLs already deliberately filter it.

## Resolution (decided)

Combine options 1 and 3, subject to the required independent record challenge. Keep checkout-success's existing ownership checks and Clerk return URL intact. Cover nested return URLs and referrers rather than checking only a top-level `session_id`. No Sentry settings or stored events change.

Add a positive control to the CSP E2E spec: inject a harmless foreign-host script, fulfill its request locally, intercept Sentry's security endpoint before navigation, and require the existing violation observer to record the script directive and foreign origin. Preserve `test` from `./helpers/clerk-auth-test`. Also prove sensitive document responses contain no delivery directives, while an ordinary document still reports to the intercepted endpoint. The local observer is not evidence of production Sentry delivery.

## Verification

- [ ] Independent challenge of this record and severity before implementation/publication.
- [ ] Red-first tests: add-card URL has no Session identifier; sensitive URL, nested Clerk return URL and sensitive referrer cannot receive native delivery headers; ordinary URLs retain delivery.
- [ ] Browser evidence: positive control detects a real violation without sending it to Sentry; credential-bearing document navigation produces no native report; checkout ownership and sign-in recovery remain covered.
- [ ] Full local gate, including serialized E2E, and exact-head CI.
- [ ] Independent adversarial review of the built diff and exact-head CodeRabbit approval before promotion.
- [ ] After promotion, read-only production header probes with synthetic non-secret query values show the privacy boundary and an ordinary page still has reporting headers. No live purchase or remote database access.

## Related

- BUG-378, BUG-325, BUG-318; ADR-026.
