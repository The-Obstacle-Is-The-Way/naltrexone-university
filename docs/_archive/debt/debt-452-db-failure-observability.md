# DEBT-452: DB Failure Observability — Cause-Dropping `INTERNAL_ERROR` Wrapping and Raw SQL/Params Reaching Logs Through Pino Serialization

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-09
**Resolved:** 2026-07-21 — FW-3 preserved the two remaining repository causes, introduced one bounded class/application-code/SQLSTATE/constraint projector for both webhook ledgers and reconciliation diagnostics, and projected every named raw `err`/`error` logger seam. Real-Drizzle/Pino sentinel coverage proves SQL, params, messages, details, stacks, cause text, and arbitrary values do not cross the diagnostic boundary; public `ActionResult` behavior is unchanged.
**2026-07-21 owner continuation ruling:** The FW-3 prompt's over-broad test-freeze constraint was corrected while leaving the Direction table unchanged; 13 existing ledger/log-shape assertions now expect the safe projection, with primary-error selection, thrown-error identity, retry, and transaction/control-flow assertions preserved.
**2026-07-18 staleness audit:** Stale but real against `ddad8eee`. BUG-285 has long since moved Stripe failure persistence to a fresh transaction; this doc now treats that as the current baseline while retaining the cause-projection and safe-logging gaps.
**2026-07-21 FW-3 anchor correction:** All code anchors below were re-stamped against the final implementation: repository cause arms, shared projector, fresh ledger persistence, reconciliation log/result split, action fallback, route seams, logger contract, and sentinel proof now point to their post-FW-3 locations.

---

## Direction (2026-07-21 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1. Cause preservation and durable diagnostics | **FIX (Option 1, minimal form)** | Add `{ cause: error }` to the two still-generic mappings (`DrizzleStripeCustomerRepository.insert` and `DrizzleUserRepository.mapDbError`), retain the already-conforming `deleteByClerkId`, and replace both webhook `toErrorData` copies with one pure bounded projector. It may emit only error class, application code, PostgreSQL SQLSTATE, and constraint; it must not serialize message, detail, query, params, stack, cause text, or arbitrary raw values. Use that same projection for the reconciliation log while keeping its returned failure string generic. | Option 2's repo-only provenance, which leaves both ledgers generic; Option 3's new lint/enforcement mechanism. A one-time source sweep is verification, not a permanent lint rule. | (a) Two cause additions plus one shared projector consolidate existing behavior; (b) both cause loss and duplicated ledger projection are live; (c) Blast radius: a DB failure can leave durable ledger/reconciliation evidence without a stable driver discriminator. Fix cost: two wrapper options, one bounded pure helper, and focused consumers; (d) removes duplication and aligns sibling adapters; (e) establishes the cluster's single safe error seam without changing failure ownership. |
| 2. Raw SQL/params reaching logs | **FIX (Option 1, minimal form)** | Apply the Part 1 projector before every raw unknown logged under either `{ err }` or `{ error }`, including `handleError` and the Clerk/Stripe/health route seams; no raw error object reaches Pino. Pin both keys with a real `DrizzleQueryError` sentinel. | Option 2 as an `err`-only serializer; Option 3's redact-path additions; any representation that retains raw message/stack/cause text. | (a) Reuses one projector rather than layering redaction and serializers; (b) installed Drizzle/Pino behavior proves SQL and bound params reach logs today, so no traffic measurement is needed; (c) Blast radius: logs expose SQL/internal identifiers now and can expose PII after a future wrapping regression. Fix cost: one already-required projector at the two logging shapes; (d) one allowlist is the security source of truth; (e) the same boundary governs durable ledgers and operational logs. |

Error ownership is ordered: repositories preserve causes, controllers select the primary error, and one bounded projector controls what crosses into the two webhook failure ledgers or raw-error log seams. DEBT-458 owns the earlier primary-error selection problem; this doc cannot recover an error that control flow already discarded. No raw message, detail, query, params, stack, or cause text is part of this diagnostic contract; DEBT-443's separate idempotency public-error codec remains the owner of cached client-facing error parity.

**2026-07-21 direction-review correction:** the 2026-07-18 text counted three generic mappings, but current `dev` already gives `DrizzleUserRepository.deleteByClerkId` an `{ cause: error }` option and a deadlock-observability comment. The two remaining cause-dropping mappings are `DrizzleStripeCustomerRepository.insert` and `DrizzleUserRepository.mapDbError`; the duplicated webhook projectors and raw Pino seams remain unchanged.

## Description

Two independent seams made database-failure diagnostics either too sparse or too revealing. Two repository paths replaced the caught value with a generic `INTERNAL_ERROR`, removing the stable driver code/constraint/cause from the error object that reached callers; `deleteByClerkId` was already the conforming third sibling. Separately, the fallback controller log path passed raw errors to Pino's default `err` serializer; drizzle-orm's `DrizzleQueryError` embeds the SQL and every bound parameter in both its message and enumerable properties. One under-informed; the other over-informed. Neither changed the mapped user response.

### 1. Cause-dropping `INTERNAL_ERROR` wrapping erases stable diagnostics; the Clerk failure ledger loses the root cause

FW-3 added `{ cause: error }` to the catch-all arm of [`DrizzleStripeCustomerRepository.insert`](../../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L64) at [lines 77-82](../../../src/adapters/repositories/drizzle-stripe-customer-repository.ts#L77) and [`DrizzleUserRepository.mapDbError`](../../../src/adapters/repositories/drizzle-user-repository.ts#L39) at [lines 49-54](../../../src/adapters/repositories/drizzle-user-repository.ts#L49). [`deleteByClerkId`](../../../src/adapters/repositories/drizzle-user-repository.ts#L187) remains conforming. [`ApplicationError` accepts `options.cause`](../../../src/application/errors/application-errors.ts#L87), matching the existing sibling idiom ([drizzle-subscription-repository.ts#L183-L188](../../../src/adapters/repositories/drizzle-subscription-repository.ts#L183), [drizzle-attempt-repository.ts#L199-L204](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L199), [drizzle-practice-session-repository.ts#L434-L439](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L434), [drizzle-question-feedback-repository.ts#L99-L105](../../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L99)).

FW-3 replaced both private `toErrorData()` helpers with [`projectSafeErrorDiagnostics`](../../../src/adapters/shared/safe-error-diagnostics.ts#L44), whose output is limited to `name`, application `code`, `sqlState`, and `constraint`. Stripe [`persistFailure`](../../../src/adapters/controllers/stripe-webhook-controller.ts#L63) and Clerk [`persistFailure`](../../../src/adapters/controllers/clerk-webhook-controller.ts#L187) stringify that projection. On the Clerk path, `processClerkWebhook` still catches the failed transaction at [lines 455-457](../../../src/adapters/controllers/clerk-webhook-controller.ts#L455) and persists through the existing fresh transaction at [lines 194-204](../../../src/adapters/controllers/clerk-webhook-controller.ts#L194).

The Stripe-customer site has two distinct callers and must not be described as one ledger outcome:

- Reconciliation calls `stripeCustomers.insert` inside Phase 4 ([reconcile-stripe-subscriptions.ts#L255-L279](../../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L255)); its catch logs the safe projection while the returned failure string remains generic ([lines 348-361](../../../src/adapters/jobs/reconcile-stripe-subscriptions.ts#L348)).
- Stripe webhook processing calls the same repository inside the shared transaction. As originally filed, a statement-level Postgres failure aborted that transaction and the in-transaction `markFailed` died with `25P02` — no failure row committed (the pre-fix BUG-285 state). **Wave-1 update (2026-07-11):** [BUG-285's fix (PR #626)](../bugs/bug-285-stripe-webhook-markfailed-on-aborted-transaction.md) persists failure state in a fresh transaction; FW-3 now stores the bounded projection through that same boundary at [lines 296-301](../../../src/adapters/controllers/stripe-webhook-controller.ts#L296).

Fixing only the repository wrappers is insufficient for the Clerk ledger because `toErrorData` still ignores `cause`. Conversely, serializing raw cause messages/details would conflict with part 2's secrecy boundary. The shared requirement is a bounded, allowlisted diagnostic projection (error class and stable driver code/constraint where present), not arbitrary cause serialization.

### 2. Raw DB errors through pino's default `err` serializer log full SQL + bound params

Before FW-3, [`handleError`](../../../src/adapters/controllers/action-result.ts#L46) logged a non-`ApplicationError` as raw `{ err: error }`. With installed `pino@10.3.1` / `pino-std-serializers@7.1.0`, the default `err` serializer copies `message`, `stack`, and enumerable properties; it also appends nested cause messages/stacks to the top-level message/stack while omitting the cause object itself. drizzle-orm 0.45.2 constructs `DrizzleQueryError` with ``Failed query: ${query}\nparams: ${params}`` and enumerable `query`/`params` fields. The FW-3 sentinel test proves that behavior and the safe replacement through both keys ([logger.test.ts#L46-L92](../../../lib/logger.test.ts#L46)); `handleError` now projects at [lines 73-76](../../../src/adapters/controllers/action-result.ts#L73).

The raw postgres.js object is not the primary vector: postgres.js 3.4.9 adds `query`/`parameters` non-enumerably when `debug` is false (`node_modules/postgres/src/connection.js:403-408`). Pino's `err` serializer omits the nested cause object as a property, although it incorporates its message/stack into the outer serialized strings. The confirmed SQL/parameter disclosure comes from the enumerable `DrizzleQueryError` wrapper and its own params-bearing message/stack.

This source audit found no current PII-bearing write that both escaped repository wrapping and reached `handleError`; that was a source conclusion, not proof about historical production logs. FW-3 made the seam independent of future wrapping discipline: the security contract beside [`lib/logger.ts#L18-L24`](../../../lib/logger.ts#L18) names `projectSafeErrorDiagnostics` as mandatory, and the real-Drizzle/Pino sentinel guards it.

Related route-level log sites use the key `error` rather than `err`; FW-3 applies the same projector at every Clerk seam ([handler.ts#L77-L138](../../../app/api/webhooks/clerk/handler.ts#L77)), Stripe seam ([handler.ts#L68-L106](../../../app/api/stripe/webhook/handler.ts#L68)), and health seam ([handler.ts#L44-L65](../../../app/api/health/handler.ts#L44)). No logger serializer or redact-path policy was added.

## Impact

Today: no mapped user-response defect and no current PII-bearing unwrapped path identified. Part 1 makes Clerk and Stripe failure rows plus reconciliation failures materially less diagnosable; BUG-285 already supplies the Stripe ledger's fresh-transaction durability, but the stored projection remains cause-less. Part 2 is an active SQL/internal-identifier disclosure channel and a latent PII channel if wrapping discipline regresses. P4 remains appropriate: this is operational/security hardening with no confirmed current PII disclosure or correctness failure attributable to these seams.

## Proposed Resolution

**Part 1 (cause-dropping wrappers):**

1. **CHOSEN, minimal form:** Add `{ cause: error }` to the two remaining generic mappings, retain the already-conforming deletion mapping, and replace the duplicate webhook `toErrorData()` helpers with one bounded diagnostic projector that allowlists only error class, application code, PostgreSQL code, and constraint name. Apply the same safe diagnostic to the reconciliation log while keeping its returned failure string generic. Do **not** serialize message, detail, query, params, stack, cause text, or arbitrary raw values. BUG-285's fresh-transaction persistence remains the separate durability owner.
2. **REJECTED BY DIRECTION REVIEW:** Repo-side `{ cause: error }` only preserves provenance for callers that deliberately inspect it but leaves both durable ledgers generic and does not close Part 2.
3. **REJECTED BY DIRECTION REVIEW:** Do not add a lint rule or new enforcement framework. A one-time source sweep for equivalent generic catch mappings is part of verification; a future recurrence may justify enforcement only with evidence.

**Part 2 (raw SQL/params in logs):**

1. **CHOSEN, minimal form:** Use the Part 1 projector at both `{ err }` and `{ error }` logging seams. For `DrizzleQueryError`, emit only the allowlisted class plus stable driver code/constraint from the cause; drop raw `message`, `stack`, `query`, `params`, and cause text because both message **and stack** contain bound values. No raw unknown error object may reach Pino through either key.
2. **REJECTED BY DIRECTION REVIEW:** Logger serializers are not a second policy layer. An `err`-only serializer is incomplete, and configuring both keys still duplicates the explicit projector contract already required for durable ledgers and fake-backed logger tests.
3. **REJECTED BY DIRECTION REVIEW:** Redact-path additions are insufficient because `DrizzleQueryError` bakes params into `message` and `stack`.

## Verification

- **Part 1:** Unit tests asserting the two remaining generic mappings attach the original cause and the deletion mapping remains conforming; projector tests proving only class/application code/PostgreSQL code/constraint survive; Clerk- and Stripe-controller tests proving that projection reaches each durable ledger through its existing fresh persistence transaction; and a reconciliation test proving the safe diagnostic is logged while the returned string stays generic.
- **Part 2:** A unit test that logs a real `DrizzleQueryError` containing a sentinel email in params through both `{ err }` and `{ error }` keys and asserts the sentinel, SQL, raw cause message/detail, params-bearing stack, and arbitrary enumerable properties are absent. Pin useful allowlisted fields separately.
- Docs: note the chosen projector contract next to the security note in `lib/logger.ts`.

## Related

- [DEBT-411 (archived)](./debt-411-local-e2e-flakiness-and-error-masking.md) — E2E test-infra reset-error masking only; distinct from this production adapter-seam gap.
- [DEBT-171 (archived)](./debt-171-subscription-repo-and-postgres-errors-missing-tests.md) — subscription-repo/Postgres-error test coverage; the subscription repo is one of the siblings that already passes `{ cause }`.
- [BUG-285](../bugs/bug-285-stripe-webhook-markfailed-on-aborted-transaction.md) — owns the distinct Stripe direct-statement-abort path where in-transaction `markFailed` cannot commit.
- [pino-std-serializers v7.1.0 `err` source](https://github.com/pinojs/pino-std-serializers/blob/v7.1.0/lib/err.js) — confirms message/stack-plus-causes and enumerable-property behavior used in part 2.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
