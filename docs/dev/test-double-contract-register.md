# Test-Double Contract and Known-Divergence Register

**Audited:** 2026-08-23

**Governing rule:** `.claude/rules/testing.md` → “Test-Double Fidelity: Shape vs. Behavior”

**Scope:** the 23 maintained port/gateway fakes exported by `src/application/test-helpers/fakes/index.ts`, excluding the canned `FakeUseCase` descendants, plus adapter-owned `FakeStripeCheckoutClient`

This is the live fake-fidelity census required by DEBT-472 Part B. A row with “none known” means the fake was inspected and no divergence was found. A dated waiver means there is deliberately no shared fake↔real scenario table; it does not assert parity. `tests/fake-contract-register.test.ts` derives the inventory from the application fake barrel, adds the adapter-owned Stripe fake, and fails when a row is missing, duplicated, or silent about verification or divergence.

## Common repository exclusions licensed by ADR-003

ADR-003’s Option-C rule permits application fakes to omit adapter-boundary parsing and validation. The exact affected inventory is:

- `FakeAttemptRepository`
- `FakeBookmarkRepository`
- `FakeClerkEventRepository`
- `FakeDeletedClerkUserRepository`
- `FakeIdempotencyKeyRepository`
- `FakePendingStripeCustomerCleanupRepository`
- `FakePracticeSessionRepository`
- `FakeQuestionFeedbackRepository`
- `FakeQuestionRepository`
- `FakeRenewalConsentRecordRepository`
- `FakeRenewalNoticeDeliveryRepository`
- `FakeStripeCustomerRepository`
- `FakeStripeEventRepository`
- `FakeSubscriptionRepository`
- `FakeTagRepository`
- `FakeTrialPaymentMethodSetupOperationRepository`
- `FakeUserRepository`

For those 17 fakes, “common repository exclusions” below means the fake does not reproduce adapter-owned Zod parsing where present, database type coercion, UUID/schema validation, foreign keys, unique/check constraints, transaction isolation, row/advisory locks, or database concurrency. A shared contract covers only its named observable scenarios; real-Postgres integration tests remain authoritative for the exclusions.

## B1 ruling: `FakePaymentGateway` remains a spy

DEBT-472 Part B chooses option **(b)**. `FakePaymentGateway` records application-port inputs and returns constructor-supplied constants. There is no provider behavior in that object to make realistic: replay, pagination, state transitions, signature verification, retries, and Stripe error translation all live behind `StripePaymentGateway` or its adapter-owned `StripeClient` seam. Giving this spy a Stripe state machine would duplicate the adapter and let application tests depend on provider details.

The replacement proof is layered: `fake-payment-gateway.test.ts` pins recording/canned-answer behavior; `stripe-payment-gateway.test.ts` pins adapter mapping and error translation; signed-webhook integration tests exercise real signature parsing; `checkout-success-provider.spec.ts` exercises the real TEST-mode subscription/success-sync boundary; and the `FakeStripeCheckoutClient` contract below executes the replay/list/terminal/mismatch behaviors against Stripe TEST mode. This is a waiver from fake↔real parity, not a claim that the spy simulates Stripe.

## B2 provider contract

`tests/shared/stripe-checkout-client-contract.ts` runs four scenarios against both `FakeStripeCheckoutClient` and Stripe TEST mode: a frozen idempotent create replay versus mutable live retrieval, reverse-chronological `starting_after` pagination with `has_more`, terminal-Session visibility, and same-key/different-parameter rejection. The mismatch case verifies the provider's error class, `idempotency_error` type, 400 status, and the adapter-consumed `same parameters` message phrase; its text is no longer self-consistency. The real half is credential-gated in `stripe-checkout-client-contract.integration.test.ts`; the fail-closed scheduled Stripe runner requires all four cases in addition to its two trial-clock cases. Stripe’s primary documentation defines the saved first response and parameter comparison in [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), reverse-chronological cursors and `has_more` in [Pagination](https://docs.stripe.com/api/pagination), and customer/status filtering plus cursor listing in [List all Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/list).

## Register

<!-- fake-contract-register:start -->
| Double | Verification | Known divergences |
| --- | --- | --- |
| `FakeAttemptRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `session-attempt-repository.integration.test.ts` and focused projection/filter integration suites; no fake↔real parity claim. | Common repository exclusions; in-memory evaluation does not reproduce SQL plans, transaction visibility, or concurrent insert ordering. |
| `FakeAuthGateway` | Dated provider-contract waiver (2026-08-23): four-case isolation suite; Clerk/session provisioning is covered at controller and E2E boundaries. | Constructor snapshot only; it does not call Clerk, resolve a request session, upsert a user, or reproduce provider/authentication failures. |
| `FakeBookmarkRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `bookmark-repository.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; especially no concurrent unique-index race for idempotent add. |
| `FakeClerkEventRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus real-Postgres webhook/controller coverage; no fake↔real parity claim. | Common repository exclusions; `lock` cannot reproduce transaction-scoped row locking or competing workers. |
| `FakeDeletedClerkUserRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus deletion/writer-lock integration coverage; no fake↔real parity claim. | Common repository exclusions; the in-memory lock cannot serialize concurrent Clerk update/delete transactions. |
| `FakeIdempotencyKeyRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `idempotency-key-repository.integration.test.ts` and determinacy coverage; no fake↔real parity claim. | Common repository exclusions; no SQL row-lock races, JSON serialization round trip, or process-level clock skew. |
| `FakeLogger` | Dated adapter-contract waiver (2026-08-23): isolation suite proves level-specific recording. | Recording spy only; it does not serialize, redact, emit to stdout/Sentry, apply transport levels, or reproduce reporting failures. |
| `FakePaymentGateway` | Written option-(b) waiver (2026-08-23); replacement proof is named in the B1 ruling above. | Canned-answer spy only; it does not reproduce any Stripe state, validation, idempotency, retries, errors, signatures, network behavior, or side effects, and configured outputs may be provider-impossible. |
| `FakePendingStripeCustomerCleanupRepository` | Shared fake↔real scenario table in `pending-stripe-customer-cleanup-contract.integration.test.ts`. | Common repository exclusions; the contract covers schedule/find/delete and stale ordering/filtering, not FK enforcement or concurrent scheduling. |
| `FakePracticeSessionRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus the practice-session integration matrix; no fake↔real parity claim. | Common repository exclusions; explicitly omits `paramsJson` Zod validation and cannot reproduce row locks, concurrent draft/finalize races, or JSON database round trips. |
| `FakeQuestionFeedbackRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `question-feedback-repository.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; no database idempotency race, FK enforcement, or timestamp/serialization behavior. |
| `FakeQuestionRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `question-repository.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; in-memory filtering/order does not prove SQL joins, collation, published/status predicates, or query-plan behavior. |
| `FakeRateLimiter` | Dated shared-contract waiver (2026-08-23): isolation suite plus `rate-limiter.integration.test.ts`; no fake↔real parity claim. | Scripted-result fake; its default path does not enforce a real request count/window threshold and does not reproduce Postgres concurrency, atomicity, or cleanup contention. |
| `FakeRenewalConsentRecordRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `renewal-consent-records.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; no source-column check/unique constraints, FK cascades, concurrent saves, or SQL prune locking. |
| `FakeRenewalNoticeDeliveryRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `renewal-notice-deliveries.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; no competing-worker claim locks, transaction rollback, database checks, or concurrent requeue/delivery races. |
| `FakeSha256Hasher` | Dated semantic-parity waiver (2026-08-23): consumers need a deterministic injected digest and input observation; `NobleSha256Hasher` owns cryptographic correctness. | Returns the non-cryptographic string `sha256:{input}` and records inputs; it does not compute SHA-256 or match the real digest. It still has no standalone isolation suite. |
| `FakeStripeCheckoutClient` | Shared four-scenario fake↔Stripe TEST-mode contract in `stripe-checkout-client-contract.integration.test.ts`, also run fail-closed by the scheduled Stripe proof. | Contracted only for create replay/live retrieve, reverse-chronological cursor listing, terminal visibility, and mismatch errors. It does not run Checkout UI/payment/subscription creation, networking/retries, webhooks, SetupIntents, or realistic Subscription responses; `markComplete` and time are synthetic. |
| `FakeStripeCustomerRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `stripe-repositories.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; no dual unique-index race or authoritative upsert concurrency. |
| `FakeStripeEventRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus real-Postgres webhook/event coverage; no fake↔real parity claim. | Common repository exclusions; `lock` has no transaction isolation and in-memory pruning does not reproduce SQL locking, concurrent claims, or query predicates. |
| `FakeSubscriptionRepository` | Shared fake↔real `subscription-observation-version-contract.ts`, widened on 2026-08-23 to all five port methods. | Common repository exclusions; the contract covers both lookups and observation-version/write-guard scenarios, not unique/FK enforcement, transaction locks, or concurrent writers. |
| `FakeTagRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `tag-repository.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; seeded in-memory order does not prove database ordering, collation, or row mapping. |
| `FakeTransactionalEmailGateway` | Dated provider-contract waiver (2026-08-23): isolation suite plus Resend adapter error-translation tests and delivery-queue integration coverage. | Scripted-result spy; it does not call Resend, validate provider payloads, enforce provider idempotency/rate limits, or reproduce network and ambiguous-delivery outcomes unless explicitly queued. |
| `FakeTrialPaymentMethodSetupOperationRepository` | Dated shared-contract waiver (2026-08-23): isolation suite plus `trial-payment-method-setup-operations.integration.test.ts`; no fake↔real parity claim. | Common repository exclusions; no competing-worker claim locks, transaction rollback, FK/check constraints, or concurrent terminal/completion races. |
| `FakeUserRepository` | Dated shared-contract waiver (2026-08-23): DEBT-455’s paired fake and real Postgres scenarios plus both isolation and `user-repository.integration.test.ts`; no general parity claim. | Common repository exclusions; paired tests cover the known stale-observation/ownership ordering and monotonic timestamp fixes, not unique-index concurrency, transaction locks, or all upsert races. |
<!-- fake-contract-register:end -->

## Generalized-harness ruling

DEBT-455 was right to reject a universal repository harness for two `FakeUserRepository` defects: one abstraction spanning unrelated ports, fixtures, clocks, transactions, and cleanup would erase behavior rather than clarify it. The 24-surface census changes what is proportionate, but not in favor of one generic harness. Part B therefore accepts **shared, port-owned scenario tables** where blast radius justifies them (`SubscriptionRepository`, pending Stripe cleanup, and Stripe Checkout) and adds this executable census/waiver guard for every other surface. A future fourth shared scenario table should reuse the small runner shape, not invent a cross-port assertion DSL. Any change to a waived fake’s behavior or corresponding adapter invalidates its dated waiver and must either add a shared scenario or re-adjudicate the waiver in this register.
