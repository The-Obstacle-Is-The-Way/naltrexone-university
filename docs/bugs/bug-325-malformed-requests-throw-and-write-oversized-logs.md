# BUG-325: Malformed Anonymous Requests Make Our Code Throw and Write Oversized Error Logs

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — no Sentry event from the fixed paths for two weeks after the deploy; due 2026-10-20
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
- **Shipped with [BUG-324](../_archive/bugs/bug-324-server-actions-accept-caller-supplied-dependencies.md) (2026-10-06).** Every form action returns at once for input that is not form data. `tests/server-action-input.test.ts` checks every exported action.

### 2. A refused subscribe logs the raw idempotency key at error level (P3)

- **Evidence.**
  - A form post with valid consent fields and a huge `idempotencyKey` fails the controller's input check before authentication (`src/adapters/controllers/billing-controller.ts:37-50`).
  - `runSubscribeAction` then logs `{ plan, idempotencyKey, errorCode, errorMessage }` at error level as "Stripe checkout failed" (`app/pricing/subscribe-action.ts:50-59`).
  - Server actions accept 1 MB bodies by default. Pino escapes control characters, so no forged lines are possible; the problem is size and mislabelling. Confirmed in source.
- **Decided.** Never log the key, only its length. A `VALIDATION_ERROR` is a warning, not a checkout failure, since it covers the caller's mistake, a forgery, and an offer that changed since the page loaded. Other failures stay errors. (First decided as silence for `VALIDATION_ERROR`, corrected after the independent review: our server raises "the displayed offer has changed" itself, and silence would hide a deploy that broke every checkout.)

### 3. `/checkout/success?session_id=` makes a Stripe call and a Sentry error per request (P3, signed in)

- **Evidence.**
  - The page checks only that `session_id` is not empty (`app/(marketing)/checkout/success/checkout-success-sync.tsx:132-136`).
  - It then calls `requireUser` (Clerk) and `checkout.sessions.retrieve` (Stripe) (`:146-157`). Stripe's 404 is not transient, so it is thrown, unhandled, and reaches Sentry. Its message contains the submitted text.
  - Any free account can repeat this, spending the shared Clerk and Stripe limits. Nothing leaks back, and another user's real session still fails the ownership check. Confirmed in source.
- **Decided.**
  - Refuse text that is not shaped like a Stripe Checkout session ID (`cs_` and then letters, digits and underscores) before any call. The shape is broad enough for test fixtures and real IDs alike.
  - Limit each signed-in user to ten visits a minute, before the Clerk lookup and the Stripe call. A limiter that fails lets the visit through.
  - Treat Stripe's `resource_missing` as a quiet `invalid_session_id`, logged at info. The exception is a session that exists under the other Stripe mode's key: that is a setup error, so it stays an error.

### 4. Next.js's own refusals of malformed action posts may reach Sentry (P3)

- **Evidence (traced in Next's action handler, not confirmed by a test).** Next.js refuses some malformed server-action posts by throwing, and the reviewer traced those errors into `onRequestError`. None needs an account.
- **Decided at filing.** Confirm with a test, and filter them in the server `beforeSend` if they arrive.
- **Revised 2026-10-06: not filtered, with a trigger.**
  - A server-side filter would not protect the quota: anyone can post events straight to Sentry (item 5).
  - Production Sentry shows none of these errors in the 14 days to 2026-10-06, so they are not noise today.
  - If they ever appear and add noise, filter them by Next's error code then. Until then, our own errors keep the simpler path to Sentry.

### 5. The Sentry quota: accepted, as Sentry advises (P4)

- **The concern.** The project is on Sentry's free plan, with a fixed monthly error quota and no on-demand budget. Once the month is used up, real errors are dropped until the next cycle. A flood costs no money, but it would blind monitoring.
- **Why server-side fixes cannot settle it.** The project has one client key, and it is public in the production JavaScript (a non-printing match, 2026-10-05). Anyone can post events straight to Sentry's ingest endpoint, without touching our server.
- **What Sentry says.**
  - Its [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/) says DSNs "are safe to keep public because they only allow submission of new events". It calls abuse "a rare occurrence", and names IP blocking and key rotation as the controls.
  - [Spike protection](https://docs.sentry.io/pricing/quotas/spike-protection) is on automatically on every plan. It is on here (`quotas:spike-protection-disabled: false`), and drops events once volume passes a threshold derived from the project's baseline.
- **What was tried and rejected.**
  - **A per-key cap.** The owner approved one, but Sentry ignored it: per-key rate limits need a higher plan. Nothing else changed.
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
- **Clerk's optional `CLERK_JWT_KEY`** lets the middleware verify session tokens without fetching Clerk's signing keys over the network. **Decided:** an optional owner setting; the cost without it is middleware time only.
- **The logger's redaction list** (`lib/logger.ts:27-46`) predates `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `DATABASE_URL`. Nothing logs `env` today. **Decided:** add them.
- **CSP violation reports** reach Sentry's report endpoint. This is already recorded as known noise in DEBT-420 (archived), so it is not re-filed.

## Progress

**2026-10-06, the fix.** Tests were written red first.
- **Item 1** shipped with BUG-324: every form action returns at once, without logging, for input that is not form data.
- **Item 2.** `runSubscribeAction` (`app/pricing/subscribe-action.ts`) logs the idempotency key's length, never the key. A `VALIDATION_ERROR` is logged at warn ("Stripe checkout refused its input"), and other failures at error.
- **Item 3.** `syncCheckoutSuccess` (`app/(marketing)/checkout/success/checkout-success-sync.tsx`):
  - refuses a `session_id` that is not `cs_` and then up to 255 letters, digits and underscores, before any call;
  - limits each signed-in user to ten visits a minute (`CHECKOUT_SUCCESS_RATE_LIMIT`), keyed by the session's Clerk user, before the user lookup and Stripe;
  - treats Stripe's `resource_missing` as a quiet `invalid_session_id` at info, with only the ID's length. A session that exists in the other Stripe mode is logged at error.
- **Item 4** is not filtered, for the reason and with the trigger above.
- **Item 5.** The response plan is in `docs/dev/logging.md`.
- **Item 6.**
  - The question page caps the slug and origin in its telemetry line at 100 characters.
  - Every failed webhook signature check logs at warn: the three routes, and Stripe's processor, which keeps Stripe's reason. A Stripe payload failure behind a valid signature stays an error.
  - The logger redacts each secret the env schema declares, at the top level and one level down. A test checks the list against the schema and round-trips a log through pino.
  - BUG-323's limiter covers the handshake parameter.

**2026-10-06, the independent review's findings** (same pull request), all fixed above:
- **(P2)** Silencing every `VALIDATION_ERROR` hid real failures.
- **(P2)** A well-shaped session ID still cost a Clerk lookup and a Stripe call per request, for any account.
- **(P3)** Stripe's processor still logged a forged signature at error.
- **(P3)** `resource_missing` also covers a session from the other Stripe mode.
- **(P3)** An error-log check could not be measured: runtime logs are kept briefly, and pino does not feed Sentry.
- **(P3)** The record read too much like a recipe.
- **(P4)** Smaller points.

**Known gap.**
- The new checkout-success tests hand-build their dependencies and Stripe's error, as the existing checkout-success tests do.
- The maintained `FakeStripeCheckoutClient` throws a plain error for an unknown session, not Stripe's `resource_missing`.
- Giving it Stripe's answer needs a shared provider-contract scenario. That is carried to this register's Deferred table at closeout.

## Verification

- [x] Item 1: source inspection shows each form-action wrapper returns before logging or delegation for a non-FormData input. BUG-324's `tests/server-action-input.test.ts` proves no probe member is invoked; it swallows rejections and does not assert logging. *Corrected 2026-10-06: narrowed the test claim to its actual assertion.*
- [x] Item 2: a refused subscribe never logs the raw key, and a refused input is a warning.
- [x] Item 3: a malformed session ID, or one Stripe lacks, redirects with `invalid_session_id`, logged at info, with nothing thrown. Each signed-in user is limited before Clerk and Stripe, and a session from the other Stripe mode stays an error.
- [x] Item 4: decided with a trigger; production Sentry had none of these errors in 14 days.
- [x] Item 5: the response plan is in the logging guide, `docs/dev/logging.md` ("Sentry flood or quota exhaustion"). A flood is a monitoring outage, not a breach, so it links to the breach procedure instead of living in it.
- [x] Item 6: each decided change shipped; `CLERK_JWT_KEY` stays an optional owner setting.
- [ ] Engineering, by 2026-10-20: search Sentry through its API for unhandled errors from the fixed paths since production assignment (2026-10-06T11:46:31.925Z, promotion #1399, `af02fe0a`). Record the query, time range, event count and whether ingestion was healthy. Developer retains 30 days, so this window is observable. Zero events is supporting evidence, not proof of every malformed input. Caught pino log lines are not in Sentry; unit assertions cover their content and level, and no production log capture has been made. *Corrected 2026-10-06 (#1410 review): no one-hour Vercel capture exists.* The original 14-day historical search remains an operator receipt.

## Related

- [BUG-323](../_archive/bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md), [BUG-324](../_archive/bugs/bug-324-server-actions-accept-caller-supplied-dependencies.md): the same audit.
- BUG-318 (archived): what Sentry may collect. This record covers how much can be sent.
