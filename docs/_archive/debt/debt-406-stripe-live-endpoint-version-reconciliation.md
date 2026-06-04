# DEBT-406: Stripe live webhook endpoint API-version reconciliation

**Priority:** P3 (latent billing drift, not a live defect — the events we parse are version-stable, but the Dashboard webhook endpoint's pinned API version has drifted further from the code client pin and should be reconciled or consciously accepted.)
**Created:** 2026-06-04
**Source:** Surfaced while scoping [DEBT-404](./debt-404-stripe-22.2-apiversion-advance.md). That PR advanced the SDK **client** pin to `2026-05-27.dahlia`, *widening* the gap to the live webhook **endpoint** version. The drift was first noted in [DEBT-384](./debt-384-stripe-webhook-error-rate-investigation.md), whose missing-event config was closed but whose endpoint-version reconciliation was never tracked to closure.
**Related:** [DEBT-404](./debt-404-stripe-22.2-apiversion-advance.md) (the client-pin advance that widened the gap), [DEBT-384](./debt-384-stripe-webhook-error-rate-investigation.md) (original webhook investigation).
**Status:** **Resolved 2026-06-04.** The live webhook endpoint was reconciled to `2026-05-27.dahlia`, so all three surfaces (code client pin, live endpoint, prod signing secret) now match. See Resolution below.

---

## Resolution (2026-06-04)

Stripe pins a webhook endpoint's API version at **creation** and won't allow editing it (the Dashboard "Edit destination" shows the version as read-only). So reconciliation was a recreate-and-swap, executed against the **live** account:

1. **Created** a new live endpoint `we_1Tejqg…` at `api_version: 2026-05-27.dahlia` (same URL `https://addictionboards.com/api/stripe/webhook`, same 6 events) via `stripe webhook_endpoints create --api-version 2026-05-27.dahlia …`.
2. **Swapped the prod signing secret**: set Vercel production `STRIPE_WEBHOOK_SECRET` to the new endpoint's `whsec_…` and **redeployed production** (so the running deployment verifies signatures with the new secret).
3. **Deleted** the old `2026-01-28.clover` endpoint (`we_1SxtpV…`, `"deleted": true`).
4. **Named** the new endpoint (description "Production webhook for subscription billing events").

**Safety verification (clover → dahlia crosses a release-train boundary):** confirmed safe for all 6 subscribed events. The parser (`stripe-webhook-schemas.ts`) is version-tolerant (`status` as `z.string()`, `.passthrough()` on every object); the `2026-03-25.dahlia` breaking changes (retention-policy cancellation reason on Subscriptions; `events_from` config param) touch no field we read; and the invoice `parent.subscription_details.subscription` shape is stable from `basil` onward. The endpoint had **zero** event deliveries (pre-launch), so there was no traffic to disrupt.

**Test/sandbox:** unchanged and out of scope — DEBT-406 concerned only the live endpoint; the local/test webhook secret is untouched and E2E remains green (35/35).

**Remaining (go-live, not DEBT-406):** an optional real live checkout validates the full path end-to-end at launch, alongside the standard go-live checks (prod `STRIPE_SECRET_KEY`/publishable key are `*_live`, live-mode Price IDs).

---

## Problem

Stripe renders each webhook event payload at the **endpoint's** pinned API version (configured in the Dashboard), independent of the SDK client's `apiVersion` used for outbound API calls. There are now three drifting version surfaces:

| Surface | Where | Version |
|---|---|---|
| SDK client pin (outbound calls) | `lib/stripe.ts` (repo code) | `2026-05-27.dahlia` (after DEBT-404) |
| Live webhook endpoint | Stripe Dashboard (live mode) | `2026-01-28.clover` (per DEBT-384) |
| Test webhook endpoint | Stripe Dashboard (test mode) | account default |

So production webhook payloads arrive **clover-shaped** while our outbound code pins **dahlia**. This has not caused breakage because the subscription fields we parse (`status`, `current_period_end`, `items[].price.id`, `customer`, `cancel_at_period_end`) are stable across these versions, and the webhook schema (`stripe-webhook-schemas.ts`) is version-tolerant (`z.string()` status + `.passthrough()`). But version drift is a latent schema-drift surface (the original concern in DEBT-384), and DEBT-404 widened it.

## Scope — billing-ops / Dashboard, not repo code

This is **not** a repo-code change. It is a Stripe Dashboard configuration task (and a verification exercise), which is why it was correctly excluded from DEBT-404's code scope.

## What to do

1. **Decide the target**: reconcile the live (and test) webhook endpoint API version to match the code client pin (`2026-05-27.dahlia`), **or** consciously accept the drift and document the rationale (e.g., intentionally pinning the endpoint to an older stable shape).
2. **Before changing the endpoint version** (if reconciling):
   - Review the event-shape diff for our subscribed events (`customer.subscription.*`, checkout/invoice events we handle) between the current endpoint version and `2026-05-27.dahlia`. DEBT-404 Finding A confirmed no field we parse changed across `clover → dahlia` monthlies, but re-confirm for the live event set.
   - If any parsed field changed, regenerate the `tests/fixtures/stripe/*.json` fixtures against the new version (DEBT-404 left them as historical `2026-04-22.dahlia` captures) and update parsers/tests.
   - Verify webhook processing against a `2026-05-27.dahlia`-rendered event in staging (replay or trigger a real event), covering subscription create/update/pause/resume and the reconcile job.
3. **Coordinate with production**: changing the live endpoint version alters real webhook payload shapes — schedule it deliberately and monitor webhook error rates after (the DEBT-384 concern).

## Acceptance criteria

- [x] Live webhook endpoint reconciled to `2026-05-27.dahlia` (recreated; old clover endpoint deleted). Test endpoint left as-is — out of scope (live-only drift; E2E green).
- [x] Event-shape diff reviewed for the 6 subscribed events; no parsed field changed across clover→dahlia, so fixtures left unchanged (correct per Finding C).
- [x] Processing verified by analysis (version-tolerant parser; dahlia breaking changes don't touch read fields) against a zero-traffic endpoint; the optional live checkout at go-live is the final runtime confirmation.
