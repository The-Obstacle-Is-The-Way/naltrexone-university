# DEBT-528: Each Server Entry Point Repeats the Request Pipeline, and the Copies Have Drifted

**Status:** Open — one route-handler pipeline and one form-action helper; share the duplicated manage-billing request module
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

The steps around every request are copied into each entry point rather than owned once:
- authenticate;
- rate-limit;
- run;
- turn the error into a response or redirect;
- log.

The copies have already drifted, and this family's history is the same fix landing once per copy.

- **Six API route handlers** each carry their own rate-limit block, with its 429 and its 503 when the limiter fails. Two cron routes each parse `Authorization: Bearer` themselves, differently. Three webhook routes each verify a signature, in different orders.
- **The two webhooks** each keep their own failure-record writer.
- **The billing form actions** each map form input, sign-in failures and errors themselves. DEBT-180 moved manage billing's shared logic to `lib/manage-billing/` and kept a thin wrapper per route; BUG-324 then added an identical `manage-billing-request.ts` to each route.
- **The current user and their entitlement** are resolved through a request cache in most places, and again without it in others.

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
  - Both then compare hashes the same way.
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

- Add-card checks the idempotency key in the form action; subscribe and manage billing leave it to the controller (`billing-controller.ts:36,41,55`), so each reports a bad key differently.
- Query strings are built by hand in places: `${ROUTES.APP_BILLING}?error=…`, `?reason=` and `?checkout=error`. Each is parsed by a private union at its reader, bypassing `toPricingRoute` (`lib/routes.ts`).

**The current user, resolved twice:**
- Most pages use the request-cached `getRequestAuthState` (`lib/auth-request-cache.ts`).
- The billing page builds a fresh container, so `GET /app/billing` resolves the user and reads the subscription and the trial-card state twice (`app/(app)/app/layout.tsx:55-77`; `billing/page.tsx:51-76`).
- Checkout reads the session identity three times and reconciles them with a hand-written CONFLICT (`billing-controller.ts`).
- `requireEntitledUserId` ignores the dependencies it is given when the action runs on the default container (`src/adapters/controllers/require-entitled-user-id.ts:21-24`). Its unit test covers only the other branch; E2E covers the default.

**History:**
- BUG-048: both webhooks failed open, fixed per route.
- BUG-084, then BUG-088: the same response leak in the second copy.
- DEBT-093.
- DEBT-196: rate limiting added to one cron.
- BUG-207.
- `0ba85539`: the cron secret patched into each cron separately.
- BUG-325 item 6: the signature log level changed in three routes.
- DEBT-180, then BUG-324: manage billing's logic shared, then a request module copied into each route.
- BUG-165, BUG-232, BUG-247, BUG-275: one billing action's fix missing from its twin.
- DEBT-504: request IDs built per entry point.

## Impact

None of the drift is harmful today. Each new route or action copies whichever neighbor it starts from, and each pipeline fix has to find every copy. P3.

## Options

1. **One route-handler pipeline,** owning: authenticate, the rate-limit policy and key, run, the error map, failing closed, safe logging and generic bodies. One `verifyBearerSecret`. One webhook event-record protocol used by both webhooks. One server form-action helper, taking a form schema, a controller and a redirect table. One manage-billing module configured with its redirects. Typed query-string builders and parsers in `lib/routes.ts`. *Recommended.*
2. **Keep thin handlers, but fix the drift:** one shared bearer parser, one shared manage-billing request module, aligned signed-out redirects. This is cheaper and leaves the pattern.

BUG-324's rule limits the deletion: an exported server action takes only form data, so each route's redirect table is bound by its own `'use server'` entry point. Keep a two-line entry file per route over one shared module; do not let the client name the route.

The request-cached principal belongs with DEBT-502's identity resolver; this record only notes the second resolution path.

## Resolution (proposed)

Option 2's fixes now, red first where behavior changes (the bearer parser, the signed-out redirects). Option 1 with the next route or action that would add a copy.

## Verification

- [ ] One bearer parser serves both crons, and a test refuses a header with trailing text.
- [ ] One manage-billing request module; the signed-out redirect of each billing action is decided in one place and tested.
- [ ] Both webhooks record failures through one protocol.

## Related

- DEBT-502: the identity resolver.
- DEBT-504: per-entry-point request IDs.
- BUG-348: per-call-site logging.
- DEBT-527: the request's time budget.
