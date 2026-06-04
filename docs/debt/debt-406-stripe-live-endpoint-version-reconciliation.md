# DEBT-406: Stripe live webhook endpoint API-version reconciliation

**Priority:** P3 (latent billing drift, not a live defect — the events we parse are version-stable, but the Dashboard webhook endpoint's pinned API version has drifted further from the code client pin and should be reconciled or consciously accepted.)
**Created:** 2026-06-04
**Source:** Surfaced while scoping [DEBT-404](../_archive/debt/debt-404-stripe-22.2-apiversion-advance.md). That PR advanced the SDK **client** pin to `2026-05-27.dahlia`, *widening* the gap to the live webhook **endpoint** version. The drift was first noted in [DEBT-384](../_archive/debt/debt-384-stripe-webhook-error-rate-investigation.md), whose missing-event config was closed but whose endpoint-version reconciliation was never tracked to closure.
**Related:** [DEBT-404](../_archive/debt/debt-404-stripe-22.2-apiversion-advance.md) (the client-pin advance that widened the gap), [DEBT-384](../_archive/debt/debt-384-stripe-webhook-error-rate-investigation.md) (original webhook investigation).
**Status:** Open.

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

- [ ] Live and test webhook endpoint API versions are reconciled to a **documented, intentional** value (ideally `2026-05-27.dahlia` to match the client), or the drift is explicitly accepted and documented (in `lib/stripe.ts` and/or `docs/vendor-docs/stripe.md`) with rationale.
- [ ] Event-shape diff reviewed for our subscribed events; fixtures regenerated only if a parsed field changed.
- [ ] Webhook processing verified against the target version in staging; post-change webhook error rate monitored.
