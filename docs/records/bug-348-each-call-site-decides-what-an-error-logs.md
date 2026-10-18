# BUG-348: Each Call Site Decides What an Error Logs, So a Billing Failure Goes Unlogged and Raw Error Text Reaches the Logs

**Status:** Open — shared diagnostic defaults and one safe projector, red first on the silent portal failure and the raw `storeResult` message; replay policy stays with DEBT-529
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

Diagnostic logging and reporting vary across boundaries, and some paths bypass the safe error projector. Durable replay is a separate, action-aware concern already owned by the idempotency policy and DEBT-529. Two diagnostic gaps are established below.

1. **A failed manage-billing request can leave no server trace.**
   - `handleError` logs only errors that are not `ApplicationError`s, so it never logs an `INTERNAL_ERROR` or `STRIPE_ERROR`, though ADR-006 defines `INTERNAL_ERROR` as an unexpected error. Whether one is logged depends on the action.
   - Subscribe and add-card log a failed result's code. Manage billing logs nothing. Other actions leave it to the browser reporter, which can send the public `ActionResult` error, including its code/details, without the original server cause.
   - So a portal session that fails with Stripe's circuit open, or with no portal URL, comes back as a result and redirects without a log line. BUG-166's `catch` sees only a throw, and `createAction` returns every failure as a result (`:46-50` returns; `:64-69` catches), so it runs only if `handleError` itself throws.
   - The causes DEBT-452 preserved inside repository `INTERNAL_ERROR`s are likewise not written on action paths that do not log their result.
2. **Raw error text reaches the logs.** A Drizzle query error's message carries the bound SQL parameters (`Failed query: … params: …`). DEBT-452 projected the `err` and `error` log seams it named. Message strings logged under other keys were outside its sweep and can carry parameters when handed a Drizzle error; this census proves raw-message logging, not sensitive data at every site: four `toErrorMessage` helpers and 21 listed inline sites, plus the retry logger.
   - Concretely: if `storeResult` fails after an idempotent action succeeded, the wrapper logs the Drizzle message, up to 1,000 characters. Its parameters hold the cached result: for the billing portal, Checkout and trial setup, a Stripe session URL.

Sentry's filtering repeats the pattern one channel at a time: ADR-026's deny-list is applied separately to events, breadcrumbs and spans, which is how BUG-318's fix left BUG-331's carriers.

## Evidence

**Who decides to log or report:**
- `src/adapters/controllers/action-result.ts:53-67`: `handleError` logs only non-`ApplicationError`s. A census found 68 production `new ApplicationError('INTERNAL_ERROR', ...)` expressions, for example `drizzle-user-repository.ts:49-54` and `drizzle-bookmark-repository.ts:30-32`.
- `src/adapters/controllers/create-action.ts:64-69` catches errors from its execution block into a result; `schema.safeParse` at :45 runs outside that block. `createPortalSession` is built with it (`billing-controller.ts:275`).
- `lib/manage-billing/manage-billing-core.ts`: its `catch` logs; a failed result only redirects (`:52-54`).
- `src/adapters/gateways/stripe/stripe-retry.ts:7-20`: an open circuit throws `STRIPE_ERROR` "Stripe temporarily unavailable"; `stripe-portal.ts` throws `STRIPE_ERROR` when the URL is missing.
- `lib/report-client-error.ts:35-47`: `shouldReportClientError` drops four codes (the set is at :17-23). A census of production `.ts/.tsx` in `app`, `lib`, `src` and `components`, excluding tests, fixtures and test helpers, found 13 predicate calls and 45 reporter calls. Unguarded calls are not necessarily wrong: some report thrown network failures.
- The billing actions each choose their own log level: subscribe (`app/pricing/subscribe-action.ts:58-68`), add-card (`trial-payment-method-action-handler.ts:64-68`) and manage billing (above).

**Who decides what a log entry contains:**
- The projector, `projectSafeErrorDiagnostics` (`src/adapters/shared/safe-error-diagnostics.ts`), keeps the name, code, SQLSTATE and constraint. For a Stripe error it keeps only the class name, dropping Stripe's code, type and request ID, while other call sites still log message strings instead. Their motivation was not established.
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
- CSP violation reports go from the browser to Sentry without any SDK hook (`proxy.ts` report URI). No emitted CSP report has been shown to carry sensitive content. BUG-331 owns the server breadcrumb/span fixes and their remaining production verification.

**History:**
- Swallowed or unreported errors: BUG-013, BUG-018, BUG-111, BUG-112, BUG-166, BUG-212, BUG-213, BUG-214.
- Logging policy: DEBT-088 (an optional logger), DEBT-286 (caught browser failures), DEBT-452 (causes and SQL parameters at the `err` seams).
- Data leaving through errors: BUG-084, BUG-088 and BUG-207 (response bodies); BUG-318 and DEBT-513, then BUG-331 (Sentry channels).

## Impact

- A failed manage-billing request whose error is an `ApplicationError` leaves no server trace. The user still sees an error, and an open circuit follows earlier outage failures that were logged.
- If `storeResult` fails after Stripe succeeds, the wrapper logs the Drizzle message, whose parameters hold the session URL, beside the user ID. A portal URL is short-lived; a Checkout or trial-setup URL lasts 24 hours, since we set no `expires_at`. Only the owner reads these logs: one Vercel member, no drains, no pino transport, about an hour's retention (DEBT-505). The owner already has Stripe access, so this is a privacy gap, not an exploitable finding. Reassess if a member, a drain or Sentry log capture is added (DEBT-512).
- Each new log or Sentry channel has to be found and filtered by hand.

P3.

## Options

1. **Shared diagnostic defaults and one projector.** *Recommended.*
   - **The defaults.** Define expected/operational classification, log level and reportability, preserving action context and useful public messages/field errors. Operational failures produce one projected diagnostic entry, retaining a cause when one exists. Amend ADR-006. Keep action-, reason- and rollback-aware cache decisions in `shared/idempotency-error-policy.ts:39-145` under DEBT-529: the same `NOT_FOUND` is cacheable for bookmark/submit but not portal. Logging severity cannot determine replay safety.
   - **The projector.** Review an explicit allow-list of safe vendor codes/types/request IDs, then use it at error-log boundaries. Keep this pure projection independent of pino and Sentry; wire transports outward. This amends ADR-018 §4.
   - **Enforcement.** DEBT-452 rejected a lint rule until the problem recurred, with evidence; the sites above are that recurrence. Add a source scan with red cases for the demonstrated raw-message forms, helper-produced strings and aliases at error-log boundaries, rather than only the literal `error.message` spelling. Prove safe projection through the real logger path too.
2. **Patch the two live paths only:** log a failed portal result, and translate `storeResult`'s errors. That leaves the next call site to choose again.

For Sentry, BUG-331 retains the existing server-channel work. A shared credential-shape redactor or CSP policy is a candidate, not a demonstrated fix: first reproduce a leak with synthetic data through the actual SDK or report path, check false positives and ADR-026's retained pseudonymous fields, and propose an explicit ADR amendment if evidence warrants it.

## Resolution (proposed)

Option 1, red first:
- a failed portal result is logged;
- the idempotency wrapper's log of a failed `storeResult` carries no SQL parameters;
- the scan rejects a raw message in a log field.

## Verification

- [ ] A failed portal session (circuit open, missing URL) produces one log with projected diagnostics and any preserved cause.
- [ ] No log field carries an error's raw message; a scan enforces it.
- [ ] Diagnostic defaults and projection are shared, ADR-006 and ADR-018 are amended, and DEBT-529's action-aware replay policy is preserved.

## Related

- BUG-331: the open Sentry channels.
- DEBT-452 and DEBT-286 (closed): the rules this extends.
- DEBT-528: the entry points that each repeat their own logging.
