# BUG-203: Clerk Webhook Verification Falls Back to a Public Dummy Secret

**Status:** Open
**Priority:** P2
**Date:** 2026-03-10
**Component:** Clerk Webhooks / Environment Validation

---

## Description

`validateEnv()` allows `CLERK_WEBHOOK_SIGNING_SECRET` to be absent outside Vercel production and then fills in the public fallback value `whsec_dummy`. The public `/api/webhooks/clerk` route calls `verifyWebhook(req)` without supplying an explicit secret, so any deployment running without a real Clerk webhook secret will verify requests against a known, attacker-guessable signing key.

Observed behavior:
- Preview, dev, and self-hosted environments can boot without a real `CLERK_WEBHOOK_SIGNING_SECRET`.
- The webhook route still performs signature verification and then mutates user and Stripe state after "successful" verification.

Expected behavior:
- Webhook verification must fail closed when the signing secret is missing.
- The application must never substitute a public default for a live verification secret.

## Impact

- Unauthenticated remote callers can forge Clerk webhook events in affected environments.
- A forged `user.updated` can upsert local user data for an attacker-chosen Clerk user id and email.
- A forged `user.deleted` can delete the mapped local user row and trigger Stripe subscription cancellation for that user.

## Steps to Reproduce

1. Deploy a preview, development, or self-hosted environment with `/api/webhooks/clerk` enabled and `CLERK_WEBHOOK_SIGNING_SECRET` unset.
2. Create a valid Svix-signed `user.updated` or `user.deleted` payload using the known secret `whsec_dummy`.
3. POST the payload to `/api/webhooks/clerk`.
4. Observe that the request reaches `processClerkWebhook()` and executes repository mutations plus optional Stripe cancellation.

## Root Cause

Tracer-bullet path:
1. `CLERK_WEBHOOK_SIGNING_SECRET` is optional in env parsing at [lib/env.ts#L45](/Users/ray/Desktop/github/naltrexone-university/lib/env.ts#L45).
2. When Clerk is enabled, the secret is only required on Vercel production at [lib/env.ts#L126](/Users/ray/Desktop/github/naltrexone-university/lib/env.ts#L126).
3. The validated env object still substitutes `whsec_dummy` when the secret is absent at [lib/env.ts#L183](/Users/ray/Desktop/github/naltrexone-university/lib/env.ts#L183).
4. The public webhook route delegates verification via `verifyWebhook(req)` at [app/api/webhooks/clerk/route.ts#L16](/Users/ray/Desktop/github/naltrexone-university/app/api/webhooks/clerk/route.ts#L16).
5. After verification, the handler calls `processClerkWebhook(...)` at [app/api/webhooks/clerk/handler.ts#L100](/Users/ray/Desktop/github/naltrexone-university/app/api/webhooks/clerk/handler.ts#L100).
6. `processClerkWebhook()` can upsert users at [src/adapters/controllers/clerk-webhook-controller.ts#L163](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/clerk-webhook-controller.ts#L163), delete users at [src/adapters/controllers/clerk-webhook-controller.ts#L193](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/clerk-webhook-controller.ts#L193), and cancel Stripe subscriptions at [src/adapters/controllers/clerk-webhook-controller.ts#L188](/Users/ray/Desktop/github/naltrexone-university/src/adapters/controllers/clerk-webhook-controller.ts#L188).

## Recommended Fix

- Remove the `whsec_dummy` fallback for `CLERK_WEBHOOK_SIGNING_SECRET`.
- Require a real webhook signing secret whenever the Clerk webhook route is deployed, not only on Vercel production.
- If the secret is intentionally absent in local workflows, disable the route entirely or make it fail with `503` before verification.
- Add a regression test asserting that missing `CLERK_WEBHOOK_SIGNING_SECRET` cannot boot a webhook-enabled environment.

## Verification

- [x] Code-level tracer-bullet verified on 2026-03-10.
- [x] Existing tests confirm the permissive env behavior: [lib/env.test.ts#L98](/Users/ray/Desktop/github/naltrexone-university/lib/env.test.ts#L98), [lib/env.test.ts#L120](/Users/ray/Desktop/github/naltrexone-university/lib/env.test.ts#L120).
- [x] Existing route tests confirm only generic signature-failure handling, not the missing-secret path: [app/api/webhooks/clerk/route.test.ts#L104](/Users/ray/Desktop/github/naltrexone-university/app/api/webhooks/clerk/route.test.ts#L104).
- [x] Targeted verification run passed: `pnpm test --run lib/env.test.ts app/api/webhooks/clerk/route.test.ts src/adapters/controllers/billing-controller.test.ts`.
- [ ] Manual exploit harness executed against a live preview deployment.

## Related

- Deployment docs expect a distinct webhook secret per environment at [docs/dev/deployment-environments.md#L69](/Users/ray/Desktop/github/naltrexone-university/docs/dev/deployment-environments.md#L69).
- The env matrix still treats the secret as required in production at [docs/specs/master_spec.md#L2805](/Users/ray/Desktop/github/naltrexone-university/docs/specs/master_spec.md#L2805).
