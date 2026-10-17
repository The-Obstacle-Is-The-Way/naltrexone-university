# DEBT-528: Several Server Entry Points Repeat Policy, and the Copies Have Drifted

**Status:** Open — share bearer parsing, rate-limit responses, webhook failure recording and manage-billing requests; keep each endpoint's orchestration explicit
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Several entry points repeat policy, but they do not all implement one interchangeable pipeline. `createAction` already owns controller parsing, dependency resolution, execution and error mapping; manage billing already has a shared core. Health, cron bearer authentication, provider signatures and browser sessions have different contracts.

The demonstrated copies and drift are:

- **Six API route handlers** each carry their own rate-limit block, with its 429 and its 503 when the limiter fails. Two cron routes each parse `Authorization: Bearer` themselves, differently. All three webhook routes verify signatures after rate limiting; Stripe separately checks for a missing signature header before the limiter.
- **Clerk and Stripe webhooks** each keep their own failure-record writer.
- **The billing form actions** each map form input, sign-in failures and errors themselves. DEBT-180 moved manage billing's shared logic to `lib/manage-billing/` and kept a thin wrapper per route; BUG-324 then added an identical `manage-billing-request.ts` to each route.
- **The current user and their entitlement** use cached auth in pricing and the app layout/default entitlement helper, while billing also resolves them directly.

## Evidence

**API route handlers:**
- The rate-limit block, with "Rate limiter unavailable", is repeated in:
  - `app/api/stripe/webhook/handler.ts`
  - `app/api/webhooks/clerk/handler.ts`
  - `app/api/webhooks/resend/handler.ts`
  - `app/api/health/handler.ts`
  - `app/api/cron/send-renewal-notices/route-handler.ts`
  - `app/api/cron/reconcile-stripe-subscriptions/route-handler.ts`
- Bearer parsing differs:
  - Renewal (`send-renewal-notices/route-handler.ts:36-51`) splits at the first space, so `Bearer <secret> extra` is refused.
  - Reconcile (`reconcile-stripe-subscriptions/route-handler.ts:71-81`) uses `split(' ', 2)`, which drops everything after the second space, so the same header is accepted.
  - Both use the same hash comparison. With the correct secret plus trailing text, renewal refuses (401) and reconcile accepts. The secret is still required, so this is not an authentication bypass.
- Logging differs: renewal and health log through `projectSafeErrorDiagnostics`, while reconcile logs `error.message` (`route-handler.ts:175,238,266`). BUG-348's scan owns that fix.
- The Stripe webhook checks for its signature header before the limiter; Clerk and Resend rate-limit first.

**Webhook failure records:** `persistFailure` is written twice, at `src/adapters/controllers/clerk-webhook-controller.ts:187` and `stripe-webhook-controller.ts:418`, each with its own "already processed" check. BUG-183, then BUG-285 and DEBT-458, fixed the Stripe copy's transaction handling over four months.

**Billing form actions:**
- `app/pricing/manage-billing-request.ts` and `app/(app)/app/billing/manage-billing-request.ts` are identical apart from one import. The two `manage-billing-actions.ts` files differ only in an import and a type re-export.
- A signed-out user is sent to different places:

  | Action | Destination |
  | --- | --- |
  | Subscribe | Sign-up, returning to `/pricing?plan` |
  | Manage billing, from pricing (`app/pricing/manage-billing-action.ts:19-21`) | Sign-up, returning to pricing |
  | Manage billing, in the app (`app/(app)/app/billing/manage-billing-action.ts:18-19`) | Bare `/sign-up` |
  | Add a card (`trial-payment-method-action-handler.ts`) | Bare `/sign-up` |

- Add-card checks the key before the controller (`app/(app)/app/trial-payment-method-action-handler.ts:22-49`) and also at the controller boundary. Subscribe/manage billing rely on controller validation (`billing-controller.ts:36,41,55,61`). Add-card's early refusal skips its result-error log; the other paths use their route-specific result redirects/logs.
- Some pricing redirects bypass the existing typed `toPricingRoute` (`app/(app)/app/layout.tsx:63`; `checkout-success-sync.tsx:41,454`). Billing's `?error=…` has a distinct route/schema and local parser (`billing/page.tsx:164,187-193`); it needs a matching billing builder if shared, not the pricing builder.

**The current user, resolved twice:**
- Pricing and the app layout use request-cached `getRequestAuthState` (`lib/auth-request-cache.ts`); default entitled-action helpers use it too.
- The billing page builds a fresh container, so `GET /app/billing` has independent user/subscription reads in layout and page when both render, with duplicate trial-card reads only when the subscription is `inTrial` (`app/(app)/app/layout.tsx:55-77`; `billing/page.tsx:51-76`).
- A fresh successful checkout path reads identity at `billing-controller.ts:225,234,162`; a replay or early refusal need not execute all three. Its CONFLICT compares the two internal user IDs, not all three identity values. Preserve that safety check.
- `requireEntitledUserId` ignores the dependencies it is given when the action runs on the default container (`src/adapters/controllers/require-entitled-user-id.ts:24-26`). Its unit test covers only the other branch; E2E exercises the default path but does not prove its cache count or injected-dependency fidelity. Its `lib/auth-request-cache` import is composition-time wiring that the architecture scan allows (`tests/architecture-boundary-source-scan.ts:49` bans only `app/` and `components/`), and ADR-001's allowed composition locations include the `*-controller.ts` files this helper serves. Moving caching out of controllers would need an ADR amendment.

**History:**
- BUG-048: both webhooks failed open, fixed per route.
- BUG-084 pinned Stripe's already-generic error response; BUG-088 fixed Clerk's remaining raw payload-error response.
- DEBT-093.
- DEBT-196: rate limiting added to one cron.
- BUG-207.
- `0ba85539`: both cron handlers gained wiring to the already-shared secret validator.
- BUG-325 item 6: the signature log level changed in three routes.
- DEBT-180, then BUG-324: manage billing's logic shared, then a request module copied into each route.
- BUG-165 and BUG-247 show route-specific omissions. BUG-232 propagated idempotency through both manage-billing wrappers and their core. BUG-275 fixed return context on pricing. Not every cited change missed a twin.
- DEBT-504: request IDs built per entry point.

## Impact

App billing and add-card lose their return destination after an unauthenticated action: their bare sign-up falls back to the dashboard (`components/providers.tsx:74-75`). No browser reproduction was run. Independent billing reads add work; actual query counts were not measured. The bearer discrepancy still requires the secret. These limited effects and repeated policy maintenance support P3; raw-error diagnostics remain BUG-348's finding.

## Options

1. **Share the evidenced policies at their existing boundaries.** *Recommended.* One bearer parser/hash comparison, one rate-limit response/error helper with endpoint-owned policy and response shape, one manage-billing request module with route-owned redirects, and one narrow failure-ledger helper for the identical claim/lock/processed-check/failure sequence.
   - Keep health, cron and webhook orchestration explicit. Preserve signature verification order and raw bodies, provider-specific event semantics, post-commit Stripe customer deletion and original-error causality (BUG-285/DEBT-458).
   - Reuse `createAction`; do not add a competing universal controller/form framework. Framework responses and redirects stay outward in `app`/`lib`, and event-ledger policy stays behind narrow adapter seams.
   - Reuse the pricing route schema and add only the missing shared billing schema. Keep the two route-owned server-action entry points: BUG-324 allows only form data from the client, not a client-selected redirect table.
   - Make `requireEntitledUserId`'s default-container path honor the dependencies it is given. DEBT-502 owns the identity-resolution contract; this record owns the repeated resolution wiring.
2. **One universal route/form pipeline.** This would combine provider verification, browser auth, bearer auth, limiting and presentation into a module with several reasons to change. The current evidence supports smaller shared policies, not this abstraction.

## Resolution (proposed)

Option 1, red first on the bearer parser, lost return destination and production auth wiring. Extract the identical ledger protocol with tests for processed-event protection, transaction failure and preserved original errors. Consume BUG-348's diagnostic policy, DEBT-504's request correlation, DEBT-502's identity contract and DEBT-527's deadline; define none of them a second time.

## Verification

- [ ] Both crons use the same bearer parser and reject trailing text; their endpoint policy and response contracts stay explicit.
- [ ] One manage-billing request module preserves form-only actions and restores each action's intended post-sign-in destination.
- [ ] Shared limiter behavior preserves each endpoint's admission order, 429/503 status and response body.
- [ ] Clerk and Stripe share the evidenced failure-ledger sequence without losing processed-event protection, post-commit behavior or original-error causality.
- [ ] The default-container path honors injected dependencies, and a test covers it.

## Related

- DEBT-502: the identity resolver.
- DEBT-504: per-entry-point request IDs.
- BUG-348: per-call-site logging.
- DEBT-527: the request's time budget.
