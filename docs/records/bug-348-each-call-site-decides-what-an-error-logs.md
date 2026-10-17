# BUG-348: Each Call Site Decides What an Error Logs, So a Billing Failure Goes Unlogged and Raw Error Text Reaches the Logs

**Status:** Open — one error disposition table and one log projector, red first on the two live paths
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

No single owner decides whether a failure is logged, reported or cached, or what its log entry may contain. The controller wrapper, the browser reporter, the idempotency policy and each billing action decide it separately, and they disagree. Two paths break today.

1. **A failed manage-billing request can leave no server trace.**
   - `handleError` logs only errors that are not `ApplicationError`s, so it never logs an `INTERNAL_ERROR` or `STRIPE_ERROR`, though ADR-006 defines `INTERNAL_ERROR` as an unexpected error. Whether one is logged depends on the action.
   - Subscribe and add-card log a failed result's code. Manage billing logs nothing. Other actions leave it to the browser reporter, which sends only the public message.
   - So a portal session that fails with Stripe's circuit open, or with no portal URL, comes back as a result and redirects without a log line. BUG-166's logging for that path sits in a `catch` that runs only if `handleError` itself throws, because `createAction` already catches everything.
   - The causes DEBT-452 preserved inside repository `INTERNAL_ERROR`s are likewise not written on action paths that do not log their result.
2. **Raw error text reaches the logs.** A Drizzle query error's message carries the bound SQL parameters (`Failed query: … params: …`). DEBT-452 projected the `err` and `error` log seams it named. Message strings logged under other keys were outside its sweep and carry the same parameters: four `toErrorMessage` helpers and about twenty inline sites.
   - Concretely: if `storeResult` fails after an idempotent action succeeded, the wrapper logs the Drizzle message, up to 1,000 characters. Its parameters hold the cached result. For the billing portal, Checkout and trial setup, that result is a short-lived Stripe session URL.

Sentry's filtering repeats the pattern one channel at a time: ADR-026's deny-list is applied separately to events, breadcrumbs and spans, which is how BUG-318's fix left BUG-331's carriers.

## Evidence

**Who decides to log or report:**
- `src/adapters/controllers/action-result.ts:53-67`: `handleError` logs only non-`ApplicationError`s. About seventy production lines throw `'INTERNAL_ERROR'`, for example `drizzle-user-repository.ts:49-54` and `drizzle-bookmark-repository.ts:30-32`.
- `src/adapters/controllers/create-action.ts:64-69` catches every error into a result. `createPortalSession` is built with it (`billing-controller.ts:275`).
- `lib/manage-billing/manage-billing-core.ts`: its `catch` logs; a failed result only redirects (`:52-54`).
- `src/adapters/gateways/stripe/stripe-retry.ts:7-20`: an open circuit throws `STRIPE_ERROR` "Stripe temporarily unavailable"; `stripe-portal.ts` throws `STRIPE_ERROR` when the URL is missing.
- `lib/report-client-error.ts:17-23`: `shouldReportClientError` drops four codes. It is a separate call, made by hand at about 20 of the 45 `reportClientError` call sites.
- The billing actions each choose their own log level: subscribe (`app/pricing/subscribe-action.ts:58-68`), add-card (`trial-payment-method-action-handler.ts:64-68`) and manage billing (above).

**Who decides what a log entry contains:**
- The projector, `projectSafeErrorDiagnostics` (`src/adapters/shared/safe-error-diagnostics.ts`), keeps the name, code, SQLSTATE and constraint. For a Stripe error it keeps only the class name, dropping Stripe's code, type and request ID, so call sites route around it.
- `toErrorMessage` helpers that log the raw message:
  - `src/adapters/shared/with-idempotency.ts:31` (used at `:258,269-270,284`)
  - `src/adapters/jobs/reconcile-stripe-subscriptions.ts:31`
  - `reconcile-all-stripe-subscription-pages.ts:39`
  - `drain-pending-stripe-customer-cleanups.ts:35`
- Inline `error instanceof Error ? error.message : …` sites:
  - eight in `stripe-checkout-sessions.ts`;
  - five more in `with-idempotency.ts` (`:98,101,142,206,209`);
  - three in `app/api/cron/reconcile-stripe-subscriptions/route-handler.ts`;
  - one each in `drizzle-rate-limiter.ts`, `stripe-webhook-processor.ts`, `manage-billing-core.ts` (with the stack), `checkout-success-sync.tsx` and `proxy.ts:218`.
- `stripe-retry.ts:22-36`: the retry log carries the message, as ADR-018 §4 decided.
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:149-180`: `storeResult` does not translate its errors, so a raw Drizzle error reaches the wrapper. The portal, Checkout and trial setup set no `outcomeStoreFailurePolicy`, so they reach `with-idempotency.ts:278-287`.
- `proxy.ts`, `lib/clerk-call-failures.ts` and `lib/clerk-backend-call-limit.ts` write with `console.*`, bypassing pino's level and its `SECRET_ENV_NAMES` redaction.

**Sentry:**
- `lib/sentry-data-collection.ts` keeps ADR-026's deny-list of term lists, applied per channel by `scrubEvent`, `scrubBreadcrumb`, `scrubServerEvent` and `scrubSpan`.
- The credential-shape matcher the tooling uses (`tests/shared/clerk-credential-shapes.ts`) recognizes bare tokens; the app's redactor matches only `name=value` pairs.
- CSP violation reports go from the browser to Sentry without any SDK hook (`proxy.ts` report URI). No record owns that channel; BUG-331 covers server breadcrumbs and spans.

**History:**
- Swallowed or unreported errors: BUG-013, BUG-018, BUG-111, BUG-112, BUG-166, BUG-212, BUG-213, BUG-214.
- Logging policy: DEBT-088 (an optional logger), DEBT-286 (caught browser failures), DEBT-452 (causes and SQL parameters at the `err` seams).
- Data leaving through errors: BUG-084, BUG-088 and BUG-207 (response bodies); BUG-318 and DEBT-513, then BUG-331 (Sentry channels).

## Impact

- A failed manage-billing request whose error is an `ApplicationError` leaves no server trace. The user still sees an error, and an open circuit follows earlier outage failures that were logged.
- A database failure in the gap after Stripe succeeds writes a short-lived session URL, beside the user ID, to the server logs. Only the owner can read them, the logger has no third-party transport, and the URL expires within minutes. So this is not an exploitable finding; it is a privacy gap.
- Each new log or Sentry channel has to be found and filtered by hand.

P3.

## Options

1. **One disposition table and one projector.** *Recommended.*
   - **The table.** Each `ApplicationErrorCode` gets: expected or operational, log level, reportable, cacheable and public message. `handleError` and the browser reporter both read it, and operational codes are always logged with their projected cause. This amends ADR-006.
   - **The projector.** It gains a vendor allow-list (Stripe's code, type and request ID; Clerk's error codes) and becomes the only way an error enters a log. This amends ADR-018 §4.
   - **Enforcement.** DEBT-452 rejected a lint rule until the problem recurred, with evidence; the sites above are that recurrence. Add a source scan that bans `error.message` in log fields.
2. **Patch the two live paths only:** log a failed portal result, and translate `storeResult`'s errors. That leaves the next call site to choose again.

For Sentry, BUG-331 owns the server channels. This record proposes amending ADR-026 to move from per-channel deny-lists to one shared credential-shape module walked over every string in an event, and to decide what CSP reports may carry.

## Resolution (proposed)

Option 1, red first:
- a failed portal result is logged;
- the idempotency wrapper's log of a failed `storeResult` carries no SQL parameters;
- the scan rejects a raw message in a log field.

## Verification

- [ ] A failed portal session (circuit open, missing URL) produces one error log with its projected cause.
- [ ] No log field carries an error's raw message; a scan enforces it.
- [ ] One table decides log, report and cache for each error code, and ADR-006 and ADR-018 say so.

## Related

- BUG-331: the open Sentry channels.
- DEBT-452 and DEBT-286 (closed): the rules this extends.
- DEBT-528: the entry points that each repeat their own logging.
