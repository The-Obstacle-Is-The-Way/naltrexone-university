# DEBT-452: DB Failure Observability — Cause-Dropping `INTERNAL_ERROR` Wrapping and Raw SQL/Params Reaching Logs Through Pino Serialization

**Status:** Open
**Priority:** P4
**Date:** 2026-07-09
**2026-07-18 staleness audit:** Stale but real against `ddad8eee`. BUG-285 has long since moved Stripe failure persistence to a fresh transaction; this doc now treats that as the current baseline while retaining the cause-projection and safe-logging gaps.

---

## Description

Two independent seams make database-failure diagnostics either too sparse or too revealing. Three repository paths replace the caught value with a generic `INTERNAL_ERROR`, removing the stable driver code/constraint/cause from the error object that reaches callers. Separately, the fallback controller log path passes raw errors to Pino's default `err` serializer; drizzle-orm's `DrizzleQueryError` embeds the SQL and every bound parameter in both its message and enumerable properties. One under-informs; the other over-informs. Neither changes the mapped user response today.

### 1. Cause-dropping `INTERNAL_ERROR` wrapping erases stable diagnostics; the Clerk failure ledger loses the root cause

The catch-all arm of [`DrizzleStripeCustomerRepository.insert`](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L64) rethrows a generic `INTERNAL_ERROR` without the caught value ([lines 77-80](../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L77)). `DrizzleUserRepository` has the same gap in [`mapDbError`'s generic arm](../../src/adapters/repositories/drizzle-user-repository.ts#L35) and [`deleteByClerkId`](../../src/adapters/repositories/drizzle-user-repository.ts#L137). [`ApplicationError` accepts `options.cause`](../../src/application/errors/application-errors.ts#L79), and sibling adapters already use it for equivalent generic mappings ([drizzle-subscription-repository.ts#L143-L148](../../src/adapters/repositories/drizzle-subscription-repository.ts#L143), [drizzle-attempt-repository.ts#L199-L204](../../src/adapters/repositories/drizzle-attempt-repository.ts#L199), [drizzle-practice-session-repository.ts#L420-L425](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L420), [drizzle-question-feedback-repository.ts#L33-L41](../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L33)).

Both webhook controllers' private `toErrorData()` helpers serialize an `ApplicationError`'s `name`, `message`, `code`, optional `fieldErrors`, and bounded stack, but not `cause` ([stripe-webhook-controller.ts#L41-L60](../../src/adapters/controllers/stripe-webhook-controller.ts#L41), [clerk-webhook-controller.ts#L148-L175](../../src/adapters/controllers/clerk-webhook-controller.ts#L148)). On the Clerk path, `processClerkWebhook` catches the failed transaction and persists the serialized error in a fresh transaction ([clerk-webhook-controller.ts#L219-L220](../../src/adapters/controllers/clerk-webhook-controller.ts#L219), [lines 352-354](../../src/adapters/controllers/clerk-webhook-controller.ts#L352), [lines 177-204](../../src/adapters/controllers/clerk-webhook-controller.ts#L177)). A user-repository failure therefore produces a durable `clerk_events.error`, but it contains only the generic wrapper diagnostics.

The Stripe-customer site has two distinct callers and must not be described as one ledger outcome:

- Reconciliation calls `stripeCustomers.insert` inside Phase 4 ([reconcile-stripe-subscriptions.ts#L231-L246](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L231)); its outer catch logs and returns only `error.message` ([lines 307-320](../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L307)). A non-unique database failure is therefore reduced to `'Failed to upsert Stripe customer mapping'` in both the job log and result.
- Stripe webhook processing calls the same repository inside the shared transaction. As originally filed, a statement-level Postgres failure aborted that transaction and the in-transaction `markFailed` died with `25P02` — no failure row committed (the pre-fix BUG-285 state). **Wave-1 update (2026-07-11):** [BUG-285's fix (PR #626)](../_archive/bugs/bug-285-stripe-webhook-markfailed-on-aborted-transaction.md) now persists failure state in a fresh transaction, so this scenario **does** durably store a `stripe_events.error` — built from the same cause-less `toErrorData` projection. The cause-dropping wrappers therefore now weaken **both** durable ledgers (Clerk and Stripe), strengthening this part's case. The deletion flow also gained a second `deleteByClerkId` call site (the tombstone re-check at [clerk-webhook-controller.ts#L342](../../src/adapters/controllers/clerk-webhook-controller.ts#L342)) with the same cause-less generic wrapper.

Fixing only the repository wrappers is insufficient for the Clerk ledger because `toErrorData` still ignores `cause`. Conversely, serializing raw cause messages/details would conflict with part 2's secrecy boundary. The shared requirement is a bounded, allowlisted diagnostic projection (error class and stable driver code/constraint where present), not arbitrary cause serialization.

### 2. Raw DB errors through pino's default `err` serializer log full SQL + bound params

[`handleError` logs any non-`ApplicationError` as `{ err: error }`](../../src/adapters/controllers/action-result.ts#L45), at [line 72](../../src/adapters/controllers/action-result.ts#L72). With installed `pino@10.3.1` / `pino-std-serializers@7.1.0`, the default `err` serializer copies `message`, `stack`, and enumerable properties; it also appends nested cause messages/stacks to the top-level message/stack while omitting the cause object itself. drizzle-orm 0.45.2 constructs `DrizzleQueryError` with ``Failed query: ${query}\nparams: ${params}`` and enumerable `query`/`params` fields. A source-level probe against those installed versions confirmed that the emitted `err.message`, `err.stack`, and `err.params` all contain a bound value. None of [`lib/logger.ts`'s redact paths](../../lib/logger.ts#L23) cover these fields ([lines 25-45](../../lib/logger.ts#L25)), and path redaction cannot remove a value already baked into `message` or `stack`.

The raw postgres.js object is not the primary vector: postgres.js 3.4.9 adds `query`/`parameters` non-enumerably when `debug` is false (`node_modules/postgres/src/connection.js:403-408`). Pino's `err` serializer omits the nested cause object as a property, although it incorporates its message/stack into the outer serialized strings. The confirmed SQL/parameter disclosure comes from the enumerable `DrizzleQueryError` wrapper and its own params-bearing message/stack.

This source audit found no current PII-bearing write that both escapes repository wrapping and reaches `handleError`; that is a source conclusion, not proof about historical production logs. User-email writes are wrapped by `DrizzleUserRepository`, and feedback comment writes are wrapped by `DrizzleQuestionFeedbackRepository`. Current unwrapped repositories generally bind internal IDs/enums, so the already-open channel is confirmed for SQL and internal identifiers (for example, a bookmark write failure). The security note at [`lib/logger.ts#L18-L22`](../../lib/logger.ts#L18) nevertheless rests on every future PII-bearing repository remembering to wrap errors before they reach a controller; no seam-level sanitizer or regression test enforces that discipline.

Related route-level log sites use the key `error` rather than `err` ([Clerk handler line 134](../../app/api/webhooks/clerk/handler.ts#L134), [Stripe handler line 97](../../app/api/stripe/webhook/handler.ts#L97), [health handler lines 44/59](../../app/api/health/handler.ts#L44)). They bypass the named `err` serializer, but Pino's normal object serialization still emits enumerable `DrizzleQueryError.query`/`params` and enumerable properties of its cause. A fix limited to `serializers.err` would therefore leave these sites open.

## Impact

Today: no mapped user-response defect and no current PII-bearing unwrapped path identified. Part 1 makes Clerk and Stripe failure rows plus reconciliation failures materially less diagnosable; BUG-285 already supplies the Stripe ledger's fresh-transaction durability, but the stored projection remains cause-less. Part 2 is an active SQL/internal-identifier disclosure channel and a latent PII channel if wrapping discipline regresses. P4 remains appropriate: this is operational/security hardening with no confirmed current PII disclosure or correctness failure attributable to these seams.

## Proposed Resolution

**Part 1 (cause-dropping wrappers):**

1. **Recommended:** Add `{ cause: error }` to the three generic mappings, matching sibling repositories, and replace the duplicate webhook `toErrorData()` helpers with one bounded diagnostic projector that allowlists safe fields (wrapper code/message plus cause class, PostgreSQL code, and constraint name). Do **not** serialize raw cause message/detail/query/params. This enriches both durable webhook ledgers and gives reconciliation callers a stable diagnostic object; BUG-285's fresh-transaction persistence remains the separate durability owner.
2. Minimal: repo-side `{ cause: error }` only — preserves provenance for callers that deliberately inspect it, but current webhook serialization remains generic and route-level Pino handling can expose cause messages unless part 2 ships too.
3. Broader hygiene sweep: lint-style audit for `new ApplicationError('INTERNAL_ERROR'` in catch blocks without `cause` across `src/adapters/` to prevent recurrence.

**Part 2 (raw SQL/params in logs):**

1. **Recommended:** Define one safe error-diagnostic projector and use it at both `{ err }` and `{ error }` logging seams. For `DrizzleQueryError`, emit only an allowlisted class plus stable driver code/constraint from the cause; drop raw `message`, `stack`, `query`, `params`, and cause text because both message **and stack** contain the bound values. Preserve a correlation id or safe stack-frame-only representation if operators need source location, but prove it cannot retain the first-line message or nested cause messages.
2. Alternative: configure both `err` and `error` serializers in `lib/logger.ts` to call that projector. A custom `err` serializer alone is insufficient because three route handlers log under `error`.
3. Weakest, supplement only: add `err.params`, `err.query`, `err.parameters`, `err.detail`, `err.where`, `err.hint` to the redact paths — incomplete because `DrizzleQueryError` bakes params into `message`.

## Verification

- **Part 1:** Unit tests asserting the three generic mappings attach the original cause; projector tests proving safe code/constraint fields survive while raw message/detail/query/params do not; Clerk- and Stripe-controller tests proving the safe diagnostic reaches each durable ledger through its existing fresh persistence transaction; and a reconciliation test proving the safe diagnostic is logged/returned.
- **Part 2:** A unit test that logs a real `DrizzleQueryError` containing a sentinel email in params through both `{ err }` and `{ error }` keys and asserts the sentinel, SQL, raw cause message/detail, and params-bearing stack are absent. Pin useful safe fields separately.
- Docs: note the chosen serializer contract next to the security note in `lib/logger.ts`.

## Related

- [DEBT-411 (archived)](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md) — E2E test-infra reset-error masking only; distinct from this production adapter-seam gap.
- [DEBT-171 (archived)](../_archive/debt/debt-171-subscription-repo-and-postgres-errors-missing-tests.md) — subscription-repo/Postgres-error test coverage; the subscription repo is one of the siblings that already passes `{ cause }`.
- [BUG-285](../_archive/bugs/bug-285-stripe-webhook-markfailed-on-aborted-transaction.md) — owns the distinct Stripe direct-statement-abort path where in-transaction `markFailed` cannot commit.
- [pino-std-serializers v7.1.0 `err` source](https://github.com/pinojs/pino-std-serializers/blob/v7.1.0/lib/err.js) — confirms message/stack-plus-causes and enumerable-property behavior used in part 2.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
