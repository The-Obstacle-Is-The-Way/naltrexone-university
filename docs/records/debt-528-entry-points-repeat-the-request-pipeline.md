# DEBT-528: Several Server Entry Points Repeat Policy, and the Copies Have Drifted

**Status:** Open — five small deletions, each red first: the request-ID helper (from DEBT-504), cron bearer auth, rate-limit refusals, the manage-billing request copy, the bare sign-ups
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

The route handlers and billing form actions repeat the same policy in several copies, and some copies have drifted. `createAction` already owns controller parsing, dependency resolution and error mapping, and `lib/manage-billing/manage-billing-core.ts` already holds manage billing's shared logic. What remains is copy-paste around them. DEBT-504's request-ID helper is folded in here: four of its five callers are among the route handlers below.

## Evidence

Checked at `34d9aea0`.

- **Request IDs (from DEBT-504).** `lib/request-context.ts:10-24` makes a random UUID and a pino child for five entry points: `app/api/health/route.ts:12-13`, `app/api/stripe/webhook/route.ts:9-10`, `app/api/webhooks/clerk/route.ts:33-34`, `app/api/webhooks/resend/route.ts:9-10` and `app/pricing/subscribe-to-plan.ts:37-43`. None passes a user ID or an incoming ID. Vercel already groups a request's runtime log lines by its own request ID. The last caller forwards the child through `ActionOptions.logger` (`src/adapters/controllers/create-action.ts:9,49,67`). Without it, `handleError` uses the root logger (`action-result.ts:52`), the same one the container injects (`lib/container.ts:48`). ADR-008 (`:30,40-43`) decided these request IDs, so removing them amends it.
- **Cron bearer auth.** Both cron handlers carry their own copy of header parsing, the unset and header-unsafe secret checks and the hashed comparison, each with its logs: `send-renewal-notices/route-handler.ts:36-57,64-105` and `reconcile-stripe-subscriptions/route-handler.ts:75-91,128-154`. The parsers differ. Renewal takes everything after the first space, so `Bearer <secret> extra` fails the comparison (401). Reconcile's `split(' ', 2)` drops the trailing text and accepts it. The secret is still required, so this is not a bypass.
- **Rate-limit refusals.** Six handlers repeat the same block: the limiter call, a 429 with `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`, and on a limiter error a log and a 503 "Rate limiter unavailable". They are `app/api/stripe/webhook/handler.ts:49-79`, `app/api/webhooks/clerk/handler.ts:60-90`, `app/api/webhooks/resend/handler.ts:37-64`, `app/api/health/handler.ts:23-53`, `app/api/cron/send-renewal-notices/route-handler.ts:107-134` and `app/api/cron/reconcile-stripe-subscriptions/route-handler.ts:156-187`. Only the key, the policy, the log message and health's extra `ok: false` differ. The admission order differs on purpose: Stripe refuses a missing signature header before the limiter, and the crons authorize first.
- **Manage billing.** `app/pricing/manage-billing-request.ts` and `app/(app)/app/billing/manage-billing-request.ts` are identical apart from one import. DEBT-180 removed this duplication, and BUG-324's server-only split brought it back. The two `manage-billing-actions.ts` files differ only in an import and a type re-export.
- **Bare sign-ups.** Pricing's manage billing returns a signed-out user to pricing (`app/pricing/manage-billing-action.ts:19-21`), as subscribe does. The app's manage billing (`app/(app)/app/billing/manage-billing-action.ts:19`) and add-card (`app/(app)/app/trial-payment-method-action-handler.ts:62`) send a bare `/sign-up`, which falls back to the dashboard (`components/providers.tsx:74-75`).

## Impact

Each copy must be changed in step, and two already disagree: the cron parsers, and the sign-up destinations. No user-facing failure was reproduced. `proxy.ts:240` protects `/app/*`, so the app's bare sign-ups are reachable only when the proxy admits a request that the controller then refuses (an inference). P3 reflects maintenance cost, not an outage.

## Options

1. **Delete each copy into one shared function at its existing boundary.** *Recommended.* Each endpoint keeps its own orchestration, admission order, keys and response bodies.
2. **One universal route and form pipeline.** Rejected: it would join provider signatures, browser sessions, bearer auth and limiting in one module with several reasons to change.

## Resolution (proposed)

Option 1, as five separate pull requests, each red first. Reuse `createAction`; add no new framework. Framework responses and redirects stay in `app/` and `lib/`.

1. **Request IDs.** Delete `lib/request-context.ts` and its test. The five callers use the container's default logger (health uses `lib/logger` directly). Remove `ActionOptions.logger` and the `{ logger: requestLogger }` argument. Red test: a type assertion in `create-action.test.ts` that `ActionOptions` has no `logger` key. Amend ADR-008 (request IDs come from Vercel's runtime logs) and drop the helper from `docs/architecture/observability.md`. Before merging, read one production request with `vercel logs --request-id <id> --expand` and confirm its lines group together; record counts only. Leave the dated census in the privacy policy's provenance appendix (`docs/policies/legal/privacy-policy.md:190`) as it is.
2. **Cron bearer auth.** One `authorizeCronRequest` beside the crons (`app/api/cron/`) returns a 401 response or nothing. It uses renewal's parser and keeps each route's log context. Red test: reconcile refuses `Bearer <secret> extra` with 401.
3. **Rate-limit refusals.** One helper in `lib/` takes the limiter, the key and policy, the log message and an optional body extension, and returns the 429 or 503 response or nothing. Red test: the helper's own unit test, written first; every route's existing 429 and 503 tests pass unchanged.
4. **Manage billing.** Move `submitManageBilling` into `lib/manage-billing/manage-billing-core.ts`, taking the route's redirects. Each route keeps its `'use server'` entry point, which takes only form data (BUG-324), and a route-owned redirects constant. Delete both `manage-billing-request.ts`. Red test: `submitManageBilling`'s test in `manage-billing-core.test.ts`, written before the move, with each route's redirects.
5. **Bare sign-ups.** The app's manage billing and add-card redirect with `toSignUpRedirectRoute(ROUTES.APP_BILLING)`, as pricing does. Red test: each sends an unauthenticated result to sign-up with `redirect_url` set to `/app/billing`.

**Declined (needs sign-off).** These would add code or risk without removing a real copy:
- A shared webhook failure-ledger helper. The two `persistFailure` functions (`clerk-webhook-controller.ts:187`, `stripe-webhook-controller.ts:484`) are about 28 lines each, differing only in their repository and log message. Sharing them needs a generic ledger seam over two transaction shapes, saves about ten lines, and touches the path BUG-183, BUG-285 and DEBT-458 hardened.
- Changing `requireEntitledUserId`'s default-container path (`src/adapters/controllers/require-entitled-user-id.ts:22-25`). It reuses the request-cached auth state, which the same default container builds; it is not a defect.
- The billing page's second user and subscription reads (`app/(app)/app/billing/page.tsx:45-69`). These are two unmeasured, cheap reads; DEBT-450's measure-first rule applies.
- Moving `proxy.ts` and the Clerk limiter helpers from `console.*` to pino. Their logged values are already projected, and no redaction risk was shown.
- Routing three hand-built pricing URLs (`app/(app)/app/layout.tsx:66`; `checkout-success-sync.tsx:40,426`) through `toPricingRoute`. This nets zero lines and changes no behavior.

**Net code effect (estimate).** About 300 production lines and 4 files deleted (`lib/request-context.ts`, its test, both `manage-billing-request.ts`); 2 small helpers added. ADR-008 gains a short amendment.

## Verification

- [ ] Step 1: no `lib/request-context.ts`, no `ActionOptions.logger`, the type assertion holds, ADR-008 is amended, and a production request's log lines group by Vercel's request ID.
- [ ] Step 2: both crons share one authorization; reconcile refuses trailing text.
- [ ] Step 3: one rate-limit helper; each endpoint keeps its admission order, status codes, headers and body.
- [ ] Step 4: one `submitManageBilling`; the two route entry points still accept only `FormData`.
- [ ] Step 5: the app's manage billing and add-card return a signed-out user to `/app/billing`.

## Related

- DEBT-504: folded in here (step 1).
- DEBT-502: the identity resolver, not changed here.
- ADR-008, ADR-016 (rate limits), ADR-017 (webhook lifecycle).

Corrected 2026-11-15: folded DEBT-504 in as step 1; resolution narrowed to five deletions, with the failure-ledger helper, the entitlement-helper and billing-read changes, the logger move and the pricing-URL change proposed as declined; BUG-348 and DEBT-527 closed on 2026-10-23, so their references went; line drift corrected (reconcile parser `:75-85`, Stripe `persistFailure` `:484`, pricing URLs); the app's bare sign-ups need the proxy to admit a refused request; the earlier history list is in git at `34d9aea0`.
