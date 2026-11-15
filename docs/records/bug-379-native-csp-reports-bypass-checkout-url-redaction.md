# BUG-379: Native CSP Reports Bypass Checkout URL Redaction

**Status:** Verifying — after promotion, check sensitive-document reporting headers and ordinary reporting; due 2026-11-22
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
- Read-only Sentry census on 2026-11-15: `GET /api/0/projects/novamindnyc/addiction-boards-web/events/`, `full=true`, start `2026-10-16T00:00:00Z`, end `2026-11-15T14:56:07Z`, followed every next cursor through 441 pages. All 4,403 retained events were CSP: Preview 3,791 and production 612. In `document_uri`, 158 Preview events contained `cs_test_` and zero contained `cs_live_`; production had zero of either prefix. WEB-P held 144 matching Preview events and WEB-F held 14. WEB-F, WEB-G, WEB-H and WEB-P were resolved when checked; status did not exclude their events. Counts describe retained events in this fixed window, not all-time collection or distinct Session IDs. Raw values were neither printed nor persisted.

## Impact

Confirmed privacy/data-minimization defect, not a demonstrated account-takeover, payment authorization or entitlement bypass. Sentry's existing server-side scrubbing did not remove the identifier. The repository's deliberate redaction of credential query parameters should apply before delivery, even where an identifier alone grants no account access. Historic events remain stored under Sentry's retention rules; changing or deleting them needs the owner's separate approval.

## Options

1. Remove the unused add-card return identifier. This reduces collection at its source without changing how billing learns that a card was saved.
2. Clear checkout-success's address bar in client code after the server reads it. This shortens exposure but leaves a race: initial document scripts can report before hydration. A server redirect with a new cookie or server-side handoff could eliminate the URL, but introduces additional state, expiry and concurrent-tab behavior into payment recovery. Do not substitute a client cleanup for a pre-delivery boundary.
3. Omit native CSP delivery directives on responses whose URL or incoming referrer carries a credential query parameter, including encoded Clerk return URLs. Reuse the existing credential-parameter classification, preserve the policy and SDK error reporting, and set `Referrer-Policy: no-referrer` on those documents so the identifier does not follow into another page's report. Cost: these documents lose the native CSP tripwire for their entire lifetime, including subsequent client-side views. Checkout success uses `router.replace` for the dashboard, so that dashboard and later client-side views remain unreported until a full document load. Clerk credential parameters also trigger suppression. Conversely, client-side history changes cannot remove reporting from an already loaded document: the guarantee covers owned full-document payment returns and auth redirects, not arbitrary URL changes in an existing document. Malformed or excessively nested encoding also withholds reporting rather than guessing.
4. Ask the owner for a Sentry advanced scrubbing rule, then prove it with a canary. Useful defense in depth, but outside code and ordinary tests, and existing server-side scrubbing has already missed this field. No settings change is authorized or performed.
5. Add an application endpoint that scrubs and forwards reports. This can retain the tripwire but creates an attacker-controlled function-invocation surface, the same cost boundary rejected for the SDK tunnel in BUG-325.
6. Accept the extra collection. Rejected: the add-card URL does not need it, and SDK event URLs already deliberately filter it.

## Resolution (decided)

Combine options 1 and 3. The independent record challenge on 2026-11-15 agreed this is the smallest defensible fix, required the document-lifetime and client-side URL limitations above, and found no demonstrated exploit requiring private disclosure. Keep checkout-success's existing ownership checks and Clerk return URL intact. Cover nested return URLs and referrers rather than checking only a top-level `session_id`. No Sentry settings or stored events change.

Add a positive control to the CSP E2E spec: inject a harmless foreign-host script, fulfill its request locally, intercept Sentry's security endpoint before navigation, and require the existing violation observer to record the script directive and foreign URL. Preserve `test` from `./helpers/clerk-auth-test`. The control additionally rewrites only reporting destinations to an intercepted same-origin legacy endpoint and removes `report-to`: Reporting API delivery can be buffered beyond a route's lifetime, so rewriting the destination is the quota guarantee. All source directives remain unchanged. This proves browser evaluation, the observer and intercepted legacy delivery, not production Reporting API or Sentry delivery. Sensitive document responses must omit both delivery directives and endpoints, and a following same-origin document must receive no referrer. A short wait with no outgoing report is not the privacy proof.

## Verification

- [x] Independent challenge of this record and severity before implementation/publication; its corrections are incorporated above. The reviewer independently passed 24 checkout ownership and sign-in preservation tests.
- [x] Red-first tests: the add-card URL and seven proxy URL/referrer cases failed before the change (8 failed, 41 passed). The first implementation still failed the twice-encoded return URL; bounded decoding fixed it. The focused suites then passed all 60 tests, including the ordinary reporting control.
- [x] Browser evidence: positive control detects a real violation with delivery redirected locally; a credential-bearing document receives no delivery directives/endpoints and sends no onward referrer; checkout ownership and sign-in recovery remain covered. Recorded in #1695 and #1696.
- [x] Full local gate, including serialized E2E, and exact-head CI. #1696 records all 81 local E2E tests passing and successful source, promotion and main CI.
- [x] Independent adversarial review of the built diff and exact-head CodeRabbit approval before promotion. #1695 records the review; #1696 records the exact-head approval and guarded promotion.
- [x] After promotion, read-only production header probes with synthetic non-secret query values show the privacy boundary and an ordinary page still has reporting headers. No live purchase or remote database access. #1696's [production receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1696#issuecomment-6897752115) records every probe passing and the production-domain assignment after main CI passed.

Corrected 2026-11-15: recorded the completed checks from #1695 and #1696. The lasting reporting boundary and its document-lifetime limits are in `docs/architecture/security.md`; the implementation keeps its reason beside the code.

## Related

- BUG-378, BUG-325, BUG-318; ADR-026.
