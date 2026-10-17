# BUG-348: Each Call Site Decides What an Error Logs, So Some Failures Go Unlogged and Raw Error Text Reaches the Logs

**Status:** Open — one error disposition table and one log projector, red first on the two live paths below
**Priority:** P2
**Date:** 2026-10-17

---

## Summary

No single owner decides whether a failure is logged, reported or cached, or what its log entry may contain. The decision is spread across the controller wrapper, the browser reporter, the idempotency policy and several billing actions, and they disagree. Two paths break today:

1. **Some failures are never logged.** `handleError` logs only errors that are not `ApplicationError`s. So `INTERNAL_ERROR` and `STRIPE_ERROR` are never logged on an action path, though ADR-006 defines `INTERNAL_ERROR` as an unexpected error.
   - A billing portal session that fails with Stripe's circuit open, or with no portal URL, comes back as a result and redirects without a log line.
   - BUG-166's logging for that path sits in a `catch` that cannot run, because `createAction` already catches everything.
   - The causes DEBT-452 preserved inside repository `INTERNAL_ERROR`s are never written by any action path.
2. **Raw error text reaches the logs.** DEBT-452 decided that raw error text never reaches a log, because a Drizzle query error's message carries the bound SQL parameters. `lib/logger.ts:21-24` restates that rule; four `toErrorMessage` helpers and about twenty inline sites break it.
   - Concretely: if `storeResult` fails after the billing portal succeeded, the wrapper logs the Drizzle message, up to 1,000 characters. Its parameters hold the cached result, which is the portal's short-lived session URL.

Sentry's filtering repeats the pattern one channel at a time: it is a deny-list applied separately to events, breadcrumbs and spans, which is how BUG-318's fix left BUG-331's carriers.

## Evidence

**Who decides to log or report:**
- `src/adapters/controllers/action-result.ts:53-67`: `handleError` logs only non-`ApplicationError`s. The code base has more than a hundred `'INTERNAL_ERROR'` throw sites, for example `drizzle-user-repository.ts:49-54` and `drizzle-bookmark-repository.ts:30-32`.
- `src/adapters/controllers/create-action.ts:64-69` catches every error into a result. `createPortalSession` is built with it (`billing-controller.ts:275`).
- `lib/manage-billing/manage-billing-core.ts`: its `catch` logs; a failed result only redirects (`getManageBillingErrorRedirect`).
- `src/adapters/gateways/stripe/stripe-retry.ts:7-20`: an open circuit throws `STRIPE_ERROR` "Stripe temporarily unavailable"; `stripe-portal.ts` throws `STRIPE_ERROR` when the URL is missing.
- `lib/report-client-error.ts:17-23`: the browser reports every code except four, applied by hand at about 40 hook call sites.
- The three billing actions each choose their own log level: subscribe (`app/pricing/subscribe-action.ts:56-67`), add-card (`trial-payment-method-action-handler.ts:60-71`) and manage billing (above).

**Who decides what a log entry contains:**
- The projector: `projectSafeErrorDiagnostics` (`src/adapters/shared/safe-error-diagnostics.ts`) keeps the name, code, SQLSTATE and constraint. For a Stripe error it keeps only the class name, dropping Stripe's code, type and request ID, so call sites route around it.
- `toErrorMessage` helpers that log the raw message:
  - `src/adapters/shared/with-idempotency.ts:31` (used at `:258,269-270,284`)
  - `src/adapters/jobs/reconcile-stripe-subscriptions.ts:31`
  - `reconcile-all-stripe-subscription-pages.ts:39`
  - `drain-pending-stripe-customer-cleanups.ts:35`
- Inline `error instanceof Error ? error.message : …`: eight in `stripe-checkout-sessions.ts`, three in `app/api/cron/reconcile-stripe-subscriptions/route-handler.ts`, and one each in `drizzle-rate-limiter.ts`, `stripe-webhook-processor.ts`, `manage-billing-core.ts` (with the stack) and `checkout-success-sync.tsx`.
- `stripe-retry.ts:22-36`: Stripe's retry log carries the message.
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:149-170`: `storeResult` does not translate its errors, so a raw Drizzle error reaches the wrapper.
- `proxy.ts`, `lib/clerk-call-failures.ts` and `lib/clerk-backend-call-limit.ts` write with `console.*`. That bypasses pino's level and its `SECRET_ENV_NAMES` redaction.

**Sentry:**
- `lib/sentry-data-collection.ts` keeps a deny-list of term lists, applied per channel by `scrubEvent`, `scrubBreadcrumb`, `scrubServerEvent` and `scrubSpan`. The credential-shape matcher the tooling uses (`tests/shared/clerk-credential-shapes.ts`) recognizes bare tokens; the app's redactor matches only `name=value` pairs.
- CSP violation reports go from the browser to Sentry without any SDK hook (`proxy.ts` report URI).

**History:**
- Swallowed or unreported errors: BUG-013, BUG-018, BUG-111, BUG-112, BUG-166, BUG-212, BUG-213 and BUG-214.
- DEBT-088 (an optional logger), DEBT-286 (caught browser failures), DEBT-452 (causes and SQL parameters).
- Data leaving through errors: BUG-084, BUG-088 and BUG-207 (response bodies); BUG-318 and DEBT-513, then BUG-331 (Sentry channels).

## Impact

- A failed billing action can leave no trace for the operator.
- A database failure at the wrong moment writes a short-lived billing link, beside the user ID, to the server logs. Only the owner can read those logs, and the link expires within minutes, so this breaks DEBT-452's rule rather than exposing anyone today.
- Each new log or Sentry channel has to be found and filtered by hand.

P2: the log gaps hide billing failures before the first live sale.

## Options

1. **One disposition table and one projector.**
   - Each `ApplicationErrorCode` gets: expected or operational, log level, reportable, cacheable, and public message. `handleError` and `reportClientError` both read it, and operational codes are always logged with their projected cause.
   - The projector gains a vendor allow-list (Stripe's code, type and request ID; Clerk's error codes) and becomes the only way an error enters a log.
   - A source scan bans `error.message` in log fields, as DEBT-452's sentinel test does for its paths. *Recommended.*
2. **Patch the two live paths only:** log a failed portal result, and wrap `storeResult`. That leaves the next call site to choose again.

For Sentry, BUG-331 owns the open channels; this record proposes moving from per-channel deny-lists to one shared credential-shape module walked over every string in an event, and deciding whether CSP reports may carry page URLs.

## Resolution (proposed)

Option 1, red first:
- a failed portal result is logged;
- the idempotency wrapper's log of a failed `storeResult` carries no SQL parameters;
- the source scan rejects a raw message in a log field.

## Verification

- [ ] A failed portal session (circuit open, missing URL) produces one error log with its projected cause.
- [ ] No log field carries an error's raw message; a scan enforces it.
- [ ] One table decides log, report and cache for each error code.

## Related

- BUG-331: the open Sentry channels.
- DEBT-452 and DEBT-286 (closed): the rules this restores.
- DEBT-528: the entry points that each repeat their own logging.
