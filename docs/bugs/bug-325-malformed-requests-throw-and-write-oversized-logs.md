# BUG-325: Malformed Anonymous Requests Make Our Code Throw and Write Oversized Error Logs

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — items 2, 3 and 6 in this pull request; item 1 shipped with BUG-324; item 4 deferred
**Priority:** P3 (first drafted as P2; lowered 2026-10-05, see item 5)
**Date:** 2026-10-05 (found); filed 2026-10-06
**Resolved:** —
**Verification receipts:** —

---

## Summary

Several request shapes, most needing no account, make our server throw an unhandled error, or write an error-level log line with the caller's text, once per request. Each unhandled error is also reported to Sentry.

Our code should not throw on malformed input, nor log raw input, whatever any quota says. Items 1 to 4 and 6 fix that.

Item 5 records the Sentry-quota concern that first set this record's priority, and why it is accepted rather than engineered around. Sentry's key is public by design, so anyone can send it events directly, with or without our server. Sentry rates that abuse rare and answers it with spike protection, which is on, and with IP blocking and key rotation when it happens.

This is likely the report the owner remembered, that "a user with certain parameters could … spam logs".

## Items

### 1. The public subscribe and billing actions throw on input that isn't form data (P3)
- **Evidence.**
  - `subscribeMonthlyAction` and `subscribeAnnualAction` (`app/pricing/subscribe-actions.ts:49-55`) call `formData.get` before any check, as does `manageBillingAction` (`app/pricing/manage-billing-actions.ts:32-37`).
  - Any client can call a server action with arguments of its choosing. With a plain string, `formData.get` throws a `TypeError` before authentication. The error is unhandled, so `onRequestError` sends it to Sentry (`instrumentation.ts`).
  - The subscribe actions are on the public pricing page. Confirmed in source.
- **Decided.** Each exported action checks `formData instanceof FormData` first, and otherwise does nothing and logs nothing.
- **Shipped with [BUG-324](./bug-324-server-actions-accept-caller-supplied-dependencies.md) (2026-10-06).** Every form action returns at once for input that is not form data. `tests/server-action-input.test.ts` checks every exported action.

### 2. A refused subscribe logs the raw idempotency key at error level (P3)
- **Evidence.**
  - A form post with valid consent fields and a huge `idempotencyKey` fails the controller's input check before authentication (`src/adapters/controllers/billing-controller.ts:37-50`).
  - `runSubscribeAction` then logs `{ plan, idempotencyKey, errorCode, errorMessage }` at error level as "Stripe checkout failed" (`app/pricing/subscribe-action.ts:50-59`).
  - Server actions accept 1 MB bodies by default. Pino escapes control characters, so no forged lines are possible; the problem is size and mislabelling. Confirmed in source.
- **Decided.** A `VALIDATION_ERROR` redirects quietly. Other failures log the error code and the key's length, never the key itself.

### 3. `/checkout/success?session_id=` makes a Stripe call and a Sentry error per request (P3, signed in)
- **Evidence.**
  - The page checks only that `session_id` is not empty (`app/(marketing)/checkout/success/checkout-success-sync.tsx:132-136`).
  - It then calls `requireUser` (Clerk) and `checkout.sessions.retrieve` (Stripe) (`:146-157`). Stripe's 404 is not transient, so it is thrown, unhandled, and reaches Sentry. Its message contains the submitted text.
  - Any free account can repeat this, spending the shared Clerk and Stripe limits. Nothing leaks back, and another user's real session still fails the ownership check. Confirmed in source.
- **Decided.** Check the `cs_test_`/`cs_live_` shape first. Treat Stripe's `resource_missing` as the existing `invalid_session_id` failure, logged at info level.

### 4. Next.js's own refusals of malformed action posts may reach Sentry (P3)
- **Evidence (traced by the reviewer, not yet confirmed by a test).**
  - A post with a foreign `Origin` is refused with `E80` after `console.error` (`next/dist/server/app-render/action-handler.js:446-470`).
  - A no-JavaScript form post naming an unknown action throws `E975` (`:744`).
  - The reviewer traced both into `onRequestError`. Neither needs an account.
- **Decided.** Confirm with a test that drives `onRequestError` with each error. If they arrive, drop them in the server `beforeSend` by `__NEXT_ERROR_CODE`. Our own errors keep reaching Sentry.
- **Checked 2026-10-06: deferred.** Production Sentry has no issue in the last 14 days for `E80`, `E975`, "Invalid Server Actions request" or "Failed to find Server Action". Filtering an error that has never arrived would be blind. The trigger is the first such event, and the record's deferred row names it.

### 5. The Sentry quota: accepted, as Sentry advises (P4)
- **The concern.** The project is on Sentry's free Developer plan: 5,000 errors a month, with no on-demand budget. About 1,280 were accepted in the last 30 days, and at most 149 on one day. Once the month is used up, real errors are dropped until the next cycle. A flood costs no money, but it would blind monitoring.
- **Why server-side fixes cannot settle it.** The project has one client key, and it is public in the production JavaScript (a non-printing match, 2026-10-05). Anyone can post events straight to Sentry's ingest endpoint, without touching our server.
- **What Sentry says.**
  - Its [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/) says DSNs "are safe to keep public because they only allow submission of new events". It calls abuse "a rare occurrence", and names IP blocking and key rotation as the controls.
  - [Spike protection](https://docs.sentry.io/pricing/quotas/spike-protection) is on automatically on every plan. It is on here (`quotas:spike-protection-disabled: false`), and drops events once volume passes a threshold derived from the project's baseline.
- **What was tried and rejected.**
  - **A per-key cap.** The owner approved 200 a day, but Sentry ignored it: the API answered 200 and `rateLimit` read back `null`. Per-key rate limits need the Business or Enterprise plan. Nothing else changed.
  - **A `tunnel` route,** drafted and then rejected after review. Sentry's tunnel exists to get past ad blockers, not to stop abuse. It would add an endpoint to secure, and it would turn attack traffic into our own Vercel function invocations.
  - **A plan upgrade,** to defend a risk the vendor rates rare. Not proportionate.
- **Decided: accept, with a response plan.** If Sentry shows a sudden flood of garbage events, or the month's usage jumps:
  1. add the source IPs in the project's inbound filters;
  2. create a new client key, deploy it to `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, and revoke the old one.

  Spike protection limits the damage meanwhile. (First drafted as the primary P2 fix, and corrected after the owner challenged it on 2026-10-05.)

### 6. Smaller sources of per-request log lines (P4)
- **Question page.** `app/(app)/app/questions/[slug]/page.tsx:53-62` logs the URL's `slug` and `from` uncapped, when review parameters are present. Needs sign-in. **Decided:** cap both, or log only flags.
- **Unsigned webhook posts.** A request with a bogus signature header passes the header-presence check, then costs one rate-limiter write and two error lines before verification fails (Stripe `app/api/stripe/webhook/handler.ts:48-100`, Clerk and Resend similarly). The limiter bounds it (Audit #21 and SPEC-017 accepted this residual). **Decided:** log failed verifications at warn, once per limiter window. **Narrowed 2026-10-06:** a failed signature check, which anyone can cause, logs at warn with fixed text and the safe diagnostics. An invalid payload after a valid signature means the provider sent something unexpected, so it stays at error. The limiter already bounds the count, so "once per window" is dropped.
- **Cron routes.** A warn line per unauthenticated request, with fixed text. **Accepted:** bounded and contentless.
- **Malformed Clerk handshake token.** A garbage `__clerk_handshake` logs `Clerk: unable to resolve handshake` inside Clerk's SDK. **Decided:** BUG-323's limiter covers this parameter too.
- **`CLERK_JWT_KEY` is unset** in every Vercel environment (names read 2026-10-05). So a token with an unknown key ID makes Clerk's SDK fetch the key set. That endpoint is not rate-limited, so the cost is middleware time only. **Decided:** the owner sets `CLERK_JWT_KEY` for production, letting tokens be verified without a network call.
- **The logger's redaction list** (`lib/logger.ts:27-46`) predates `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `DATABASE_URL`. Nothing logs `env` today. **Decided:** add them.
- **CSP violation reports** reach Sentry's report endpoint. This is already recorded as known noise in DEBT-420 (archived), so it is not re-filed.

## Verification

Criteria to meet before closing; none is met yet.

- [ ] Item 1: each exported action given a non-FormData argument redirects without throwing or logging. Red first.
- [ ] Item 2: a refused subscribe never logs the raw key.
- [ ] Item 3: a malformed or missing session redirects with `invalid_session_id` and sends nothing to Sentry.
- [ ] Item 4: confirmed or refuted by test, and handled.
- [ ] Item 5: the response plan is in the incident runbook (`docs/security/incident-response-and-breach-notification.md`).
- [ ] Item 6: each decided change shipped, or deferred with its trigger in the register.

## Related

- [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md), [BUG-324](./bug-324-server-actions-accept-caller-supplied-dependencies.md): the same audit.
- BUG-318 (archived): what Sentry may collect. This record covers how much can be sent.
