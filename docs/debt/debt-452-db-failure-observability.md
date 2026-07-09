# DEBT-452: DB Failure Observability — Cause-Dropping `INTERNAL_ERROR` Wrapping and Raw SQL/Params Reaching Logs via Pino's Default `err` Serializer

**Status:** Active
**Priority:** P4
**Date:** 2026-07-09

---

## Description

Two independent seams degrade what an operator can learn from a production database failure. On one side, a handful of repository catch blocks rethrow generic `INTERNAL_ERROR` wrappers that discard the Postgres root cause, so the webhook failure ledgers record only the wrapper message. On the other side, the fallback controller log path emits raw driver errors through pino's default `err` serializer, which — via drizzle-orm's `DrizzleQueryError` wrapper — puts full SQL text plus every bound parameter value into production logs with no redaction covering them. One under-informs; the other over-informs. Neither changes user-facing behavior today.

### 1. Cause-dropping `INTERNAL_ERROR` wrapping starves the webhook failure ledgers

The catch-all arm of [`DrizzleStripeCustomerRepository.insert`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L77) rethrows `new ApplicationError('INTERNAL_ERROR', 'Failed to upsert Stripe customer mapping')` and discards the caught error, even though [`ApplicationError` accepts `options.cause`](../../src/application/errors/application-errors.ts#L83) and sibling adapters already pass it ([drizzle-subscription-repository.ts:147](../../src/adapters/repositories/drizzle-subscription-repository.ts#L147), [drizzle-attempt-repository.ts:203](../../src/adapters/repositories/drizzle-attempt-repository.ts#L203), [drizzle-practice-session-repository.ts:424](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L424), [drizzle-question-feedback-repository.ts:38/71](../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L38)). `DrizzleUserRepository` has the same gap in [`mapDbError`'s `INTERNAL_ERROR` arm (line 45)](../../src/adapters/repositories/drizzle-user-repository.ts#L45) and [`deleteByClerkId` (line 147)](../../src/adapters/repositories/drizzle-user-repository.ts#L147).

Downstream, both webhook controllers persist failures via `toErrorData()` ([stripe-webhook-controller.ts:41/148](../../src/adapters/controllers/stripe-webhook-controller.ts#L41), [clerk-webhook-controller.ts:148/182](../../src/adapters/controllers/clerk-webhook-controller.ts#L148)), which serializes `name`/`message`/`code`/`stack` but **not** `cause`. So `stripe_events.error` / `clerk_events.error` record only the generic wrapper message plus a stack pointing at the repo catch site — never the Postgres error code, constraint, or detail. Fixing the repos alone is insufficient: `toErrorData` must also serialize the cause chain, or the attached cause never reaches the ledger.

**Failure scenario:** a production `checkout.session.completed` webhook ([stripe-webhook-controller.ts:137](../../src/adapters/controllers/stripe-webhook-controller.ts#L137)) or a reconcile-stripe-subscriptions run ([reconcile-stripe-subscriptions.ts:233](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L233)) hits a non-unique-violation DB failure in the Stripe customer upsert — e.g. an FK violation after a racing user delete, a connection reset, or a 25P02 aborted transaction. `markFailed` writes only `'Failed to upsert Stripe customer mapping'` plus the wrapper's own stack. The operator investigating the failed-event ledger cannot distinguish an FK violation from a transient network blip and must reproduce blind. The verifier's correction is worth stating: the ledger is not literally zero-content — the wrapper stack does localize the failing repo — but the Postgres root cause (code/constraint/detail) is unrecoverable. The event still fails closed and is retried/recorded; the cost is purely incident diagnosability.

### 2. Raw DB errors through pino's default `err` serializer log full SQL + bound params

[`handleError` logs any non-`ApplicationError` as `{ err: error }`](../../src/adapters/controllers/action-result.ts#L72), which pino serializes with its default err serializer (pino-std-serializers copies the full message and every enumerable own property). drizzle-orm 0.45.2 wraps every failed query in `DrizzleQueryError` (`pg-core/session.js` `queryWithCache`), whose message is literally `` `Failed query: ${sql}\nparams: ${params}` `` with own-enumerable `query`/`params` properties. None of [`lib/logger.ts`'s redact paths (lines 26–43)](../../lib/logger.ts#L26) cover `err.*` — nor could path redaction scrub params baked into `err.message`.

The verifier corrected the originally-proposed mechanics: the candidate's PostgresError vector is refuted — postgres.js 3.4.9 attaches `query`/`parameters` **non-enumerably** unless `debug` is set (`connection.js:406`), and the inner `PostgresError` `detail` sits under `cause`, which the serializer skips. The live, confirmed vector is the `DrizzleQueryError` wrapper itself.

Today no PII leaks: the email-bearing users upsert is wrapped by [`mapDbError`](../../src/adapters/repositories/drizzle-user-repository.ts#L35) (returned unlogged at [action-result.ts:51–52](../../src/adapters/controllers/action-result.ts#L51)), feedback comments are wrapped in the feedback repo, and the repos with zero catch blocks (bookmark, tag, question, clerk-event, stripe-event, idempotency-key, deleted-clerk-user, parts of attempt/practice-session) bind only internal IDs/enums, which [`lib/logger.ts:21`'s policy](../../lib/logger.ts#L21) tolerates. But the documented "do not log PII" posture rests entirely on per-repository wrapping discipline with no seam-level scrub — and full SQL text plus bound row values already reach production logs whenever an unwrapped repo hits a DB error (e.g. `DrizzleBookmarkRepository`, 0 catches, during a bookmark-toggle server action against a Neon connectivity blip). The moment any future PII-bearing insert/update is added without a repository-level catch — a discipline nothing enforces or tests — the PII value logs verbatim to Vercel log retention on its first failure.

Related but distinct raw-error log sites use the key `error` instead of `err` ([app/api/webhooks/clerk/handler.ts:134](../../app/api/webhooks/clerk/handler.ts#L134), [app/api/stripe/webhook/handler.ts:97](../../app/api/stripe/webhook/handler.ts#L97), [app/api/health/handler.ts:44/59](../../app/api/health/handler.ts#L44)); these bypass the err serializer but still JSON-serialize enumerable `query`/`params` — worth covering in the same fix.

## Impact

Today: no incorrect user-facing behavior and no known PII in logs. Part 1's cost is incident diagnosability — every non-unique-violation DB failure in the Stripe customer or user repos leaves a ledger entry that cannot distinguish a schema/constraint bug from a transient blip. Part 2's cost is defense-in-depth erosion — the SQL+params-in-logs channel is already open for internal-ID values (policy-tolerated), and it becomes a PII leak on the first uncaught DB error in a future PII-bearing write path, with no test or lint standing in the way. Both parts contribute at P4: hygiene/observability, no current correctness or leak instance.

## Proposed Resolution

**Part 1 (cause-dropping wrappers):**

1. **Recommended:** Add `{ cause: error }` to the three cause-dropping throw sites (`drizzle-stripe-customer-repository.ts:77`, `drizzle-user-repository.ts:45` mapDbError `INTERNAL_ERROR` arm, `drizzle-user-repository.ts:147` deleteByClerkId), matching the established sibling pattern, **and** extend both controllers' `toErrorData()` to serialize a bounded cause chain (e.g. one level: cause name/message/pg code/constraint, secret-free) so the attached cause actually reaches `stripe_events.error` / `clerk_events.error`.
2. Minimal: repo-side `{ cause: error }` only — improves Sentry/logger output where error serializers walk cause chains, but the failure ledger stays generic.
3. Broader hygiene sweep: lint-style audit for `new ApplicationError('INTERNAL_ERROR'` in catch blocks without `cause` across `src/adapters/` to prevent recurrence.

**Part 2 (raw SQL/params in logs):**

1. **Recommended:** Add a custom `err` serializer in `lib/logger.ts` that whitelists name/message-class/code/stack and, for `DrizzleQueryError`-shaped errors, replaces the params-bearing message with a sanitized form (drop `params`, keep or truncate the SQL) — path-based redaction alone cannot scrub `err.message`.
2. Scrub at the seam: in `handleError`, map non-`ApplicationError` values through a `toErrorData`-style sanitizer (mirroring the webhook controllers' hand-serialization) before logging.
3. Weakest, supplement only: add `err.params`, `err.query`, `err.parameters`, `err.detail`, `err.where`, `err.hint` to the redact paths — incomplete because `DrizzleQueryError` bakes params into `message`.

## Verification

- **Part 1:** Unit tests asserting the three throw sites attach `cause` (assert `error.cause` is the original driver error); a `toErrorData` test that feeds an `ApplicationError` with a `cause` carrying a pg `code`/`constraint_name` and asserts the serialized ledger string contains them (and contains no secrets); an integration or fake-backed test that a failed `stripeCustomers.insert` produces a `stripe_events.error` payload naming the Postgres error code.
- **Part 2:** A unit test that logs a real `DrizzleQueryError` (constructed with SQL + params) through the configured `lib/logger.ts` logger and asserts bound values do not appear in the emitted line; extend it to the `{ error }`-keyed handler sites once they share the sanitizer. Optionally a source-scan-style guard for new `logger.error({ err: ... })` sites bypassing the sanitizer.
- Docs: note the chosen serializer contract next to the security note in `lib/logger.ts`.

## Related

- [DEBT-411 (archived)](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md) — E2E test-infra reset-error masking only; distinct from this production adapter-seam gap.
- [DEBT-171 (archived)](../_archive/debt/debt-171-subscription-repo-and-postgres-errors-missing-tests.md) — subscription-repo/Postgres-error test coverage; the subscription repo is one of the siblings that already passes `{ cause }`.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
