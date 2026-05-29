# DEBT-400: Test Fixture Integrity (Zod Boundary Class)

**Priority:** P2 (latent bug class. After PR 2a, the current canonical candidate grep finds 2,244 placeholder-ID assignments across 140 test files. This is a candidate set, not a mandate to replace every string: the execution scope is only IDs that cross `zUuid = z.guid()` controller schemas or model Drizzle `uuid()` columns.)
**Created:** 2026-05-26
**Source:** Deep schema/boundary integrity audit conducted alongside DEBT-394 archival; re-audited on 2026-05-28 from `dev` at `f2dc0793`, PR 2 scope re-audited on 2026-05-28 from `dev` at `e7f1029a` after PR 1 merged, then repository-slice PR 2b scope re-audited on 2026-05-29 from `dev` at `a98b5922` after PR 2a merged. Direct precedent is PR #330, which bumped Zod from 3 to 4 and deliberately kept historical UUID/GUID behavior by replacing the shared controller ID schema with Zod 4 `z.guid()`.
**Related:** [src/adapters/shared/zod-schemas.ts](../../src/adapters/shared/zod-schemas.ts), [db/schema.ts](../../db/schema.ts), [src/domain/test-helpers/](../../src/domain/test-helpers/), [src/application/test-helpers/fakes/](../../src/application/test-helpers/fakes/), [docs/dev/dependency-update-protocol.md](../dev/dependency-update-protocol.md), [DEBT-397](./debt-397-datetime-boundary-type-normalization.md), [DEBT-394 (archived)](../_archive/debt/debt-394-supply-chain-hardening.md), PR #330

**Status:** Active

---

## Problem

Production controller schemas validate question, session, attempt, choice, retry, and idempotency-key fields with `zUuid = z.guid()` (`src/adapters/shared/zod-schemas.ts:4`). The database also stores application-owned identifiers as Drizzle `uuid()` columns (`db/schema.ts`). Test fixtures across the repo use stringly-typed placeholders such as `q_1`, `session-1`, `attempt_1`, `choice-a`, and `user_1`.

Those placeholders are only safe when they are pure test sentinels that never cross a validating boundary and do not model a database UUID column. They are unsafe when they are used as:

- controller inputs or mocked controller outputs for fields typed with `zUuid`;
- repository row fixtures or domain/entity fixtures that model Drizzle `uuid()` columns;
- default IDs emitted by shared factories or fakes that later feed controller, repository, or integration-boundary tests.

The bug class is dormant because many unit/browser tests use fakes or module mocks instead of the real controller/schema boundary. The next validation tightening, real-controller migration, or integration-boundary test can surface the mismatch as a failure far from the fixture that introduced it.

The fix is boundary driven:

- Boundary-crossing IDs must be generated with `crypto.randomUUID()` or by a factory/fake that emits UUID-valid values.
- Pure UI/test sentinels, external provider IDs, slugs, and deliberately-invalid validation test cases stay unchanged.
- The documented rule must prevent future fixtures from copying invalid placeholder IDs into validated-boundary fields.

---

## Boundary Definition

### Shared Controller Boundary

Confirmed current API:

```typescript
// src/adapters/shared/zod-schemas.ts
export const zUuid = z.guid();
```

Controller fields currently typed with `zUuid`:

| File | Input fields | Output fields |
|---|---|---|
| `src/adapters/controllers/billing-controller.ts` | `idempotencyKey` | none |
| `src/adapters/controllers/bookmark-controller.ts` | `questionId`, `idempotencyKey` | none |
| `src/adapters/controllers/question-controller.ts` | `sessionId`, `questionId`, `choiceId`, `retryOfAttemptId`, `retrySessionId`, `idempotencyKey` | `attemptId`, `correctChoiceId`, `choiceId` |
| `src/adapters/controllers/question-view-controller.ts` | `questionId`, `attemptId`, `sessionId` | none in the explicit schema |
| `src/adapters/controllers/practice-schemas.ts` | `idempotencyKey`, `sessionId`, `questionId`, `selectedChoiceId` | `sessionId`, `questionId`, `latestSelectedChoiceId`, `draftSelectedChoiceId` |

`review-controller.ts`, `stats-controller.ts`, and `tag-controller.ts` currently have no `zUuid` input fields. They still use authenticated `userId` values returned by the auth boundary; those user IDs model `users.id` and therefore must be UUID-shaped when the fixture is an application user row/entity.

### Database UUID Columns

Confirmed current Drizzle `uuid()` columns in `db/schema.ts`:

| Table | UUID columns |
|---|---|
| `users` | `id` |
| `stripe_customers` | `id`, `userId` |
| `stripe_subscriptions` | `id`, `userId` |
| `idempotency_keys` | `userId` |
| `questions` | `id` |
| `choices` | `id`, `questionId` |
| `tags` | `id` |
| `question_tags` | `questionId`, `tagId` |
| `practice_sessions` | `id`, `userId` |
| `attempts` | `id`, `userId`, `questionId`, `practiceSessionId`, `selectedChoiceId`, `retryOfAttemptId`, `retrySessionId` |
| `bookmarks` | `userId`, `questionId` |

Confirmed current provider/text identifier columns in `db/schema.ts` that are explicitly **not** app UUIDs:

| Table | Provider/text columns |
|---|---|
| `users` | `clerkUserId` |
| `stripe_customers` | `stripeCustomerId` |
| `stripe_subscriptions` | `stripeSubscriptionId`, `priceId` |
| `stripe_events` | `id` (Stripe event id), `type`, `error` |
| `clerk_events` | `id` (Svix delivery id), `type`, `error` |
| `deleted_clerk_users` | `clerkUserId` |
| `pending_stripe_cancellations` | `eventId`, `stripeCustomerId` |
| `rate_limits` | `key` |
| `idempotency_keys` | `action`, `key`, `errorCode`, `errorMessage` |
| `questions` / `tags` | `slug`; tag `name` / `kind`; choice `label` |

Explicit non-targets:

- `stripe_events.id`, `clerk_events.id`, `deleted_clerk_users.clerkUserId`, `pending_stripe_cancellations.eventId`, Stripe `cus_` / `sub_` / `evt_` values, Clerk `user_...` values, and Svix delivery IDs are external-provider string IDs, not Drizzle UUID columns.
- Slugs such as `question.slug` and tag slugs are semantic strings, not UUIDs.
- HTML `id`, `data-testid`, React keys, and local branch markers are not in scope unless the same value is also used as one of the boundary fields above.

---

## Canonical Candidate Sweep

Use this exact reproducible grep for the broad placeholder-ID candidate set:

```sh
rg -n "\b(questionId|sessionId|attemptId|choiceId|selectedChoiceId|correctChoiceId|retryOfAttemptId|retrySessionId|userId|tagId|subscriptionId|idempotencyKey|question_id|session_id|attempt_id|choice_id|selected_choice_id|correct_choice_id|retry_of_attempt_id|retry_session_id|user_id|tag_id|subscription_id|idempotency_key|id)\s*[:=]\s*['\"](q|question|choice|session|attempt|user|tag|subscription|test|mock|fake|other|correct|incorrect|bookmark)[_-][A-Za-z0-9_-]+['\"]" \
  app/ src/ components/ tests/ \
  --glob '*.test.ts' --glob '*.test.tsx' --glob '*.spec.ts' --glob '*.spec.tsx' \
  --glob '!**/_archive/**'
```

Current result on `a98b5922` after PR 2a: **2,244 lines across 140 files**. The result on `e7f1029a` after PR 1 was **2,438 lines across 162 files**. The pre-PR1 audit result on `f2dc0793` was **2,447 lines across 163 files**.

This replaces the old narrower `604 / 64` count. The old grep only searched `app/ src/ components/`, only camel-case object properties, only five field names, and only underscore-prefixed values. It missed hyphenated placeholders (`session-1`), choice/tag/subscription fields, snake_case SQL-row fixtures (`user_id`), and `tests/**` helper fixtures.

High-count files from the original `f2dc0793` sweep, kept as directional context:

| File | Hits | Why it matters |
|---|---:|---|
| `src/application/use-cases/get-previous-attempt.test.ts` | 110 | Entity/port fixtures model attempt/session/question UUID columns |
| `src/application/test-helpers/fakes/fake-attempt-repository.test.ts` | 106 | Fake-repository fixtures model attempt UUID columns |
| `app/(app)/app/practice/shared/question-flow-actions.test.ts` | 86 | Mocked controller DTOs contain `zUuid` fields |
| `src/adapters/repositories/drizzle-attempt-repository.test.ts` | 81 | Repository row fixtures model `attempts` UUID columns |
| `app/(app)/app/questions/[slug]/question-page-logic.test.ts` | 81 | Mocked controller DTOs contain `zUuid` fields |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 78 | Mocked controller DTOs contain `zUuid` fields |
| `src/application/use-cases/get-attempted-questions.test.ts` | 76 | Entity/port fixtures model question/attempt UUID columns |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.browser.spec.tsx` | 63 | Browser fixtures use controller-shaped IDs |
| `src/application/use-cases/save-exam-draft-answer.test.ts` | 59 | Session/question/choice IDs model UUID columns |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | 55 | Component/controller-shaped IDs; classify before editing |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 44 | Mocked question/review DTOs contain UUID-shaped fields |
| `src/adapters/repositories/drizzle-practice-session-repository-question-state.test.ts` | 42 | Repository row fixtures model session/question/choice UUID columns |
| `src/adapters/controllers/question-view-controller.test.ts` | 39 | Real controller tests cross `zUuid` fields |
| `tests/e2e/helpers/seed-test-user.test.ts` | 28 | Mocked SQL rows use app `users.id` / metadata `user_id` |
| `app/(marketing)/checkout/success/page.test.ts` | 28 | User/subscription fixtures model app `users.id` |

The execution agent should regenerate the full line list from the command above instead of relying on this table as exhaustive.

---

## Findings

### A. Placeholder IDs are broad, but the cleanup boundary is narrower than the raw count

The broad candidate set is now 2,438 lines across 162 files. Many are real boundary-crossing problems, but some are intentionally harmless:

- a component-only selected-choice token that never leaves the component;
- a provider-owned external ID such as `cus_123`, `sub_123`, `evt_1`, or a Clerk `user_...` id;
- an intentionally invalid input in a validation-negative test;
- a slug or label that happens to look ID-like.

Execution must classify by the Boundary Definition above. This is not a global search-and-replace job.

### B. Some fixtures already use UUID-shaped values, but hardcoded UUIDs are not the preferred pattern

UUID-shaped literals pass validation, but they are hard to read. Prefer generated values with role-bearing variable names:

```typescript
const correctQuestionId = crypto.randomUUID();
const incorrectQuestionId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
```

Do not replace a readable placeholder with an opaque hardcoded UUID literal unless the test specifically needs a stable literal for a snapshot or fixture file.

### C. Domain factories and fakes were fixed by PR 1

PR 1 merged as #368 at `e7f1029a`. Current code now has the intended foundation:

- `src/domain/test-helpers/factories.ts` uses `crypto.randomUUID()` for generated app-owned IDs while preserving explicit overrides.
- `src/application/test-helpers/fakes/fake-attempt-repository.ts`, `fake-practice-session-repository.ts`, `fake-user-repository.ts`, and `fake-subscription-repository.ts` generate UUID-valid app IDs internally.
- `tests/shared/fixture-uuid-integrity.test.ts` proves those generated factory/fake IDs pass the real `zUuid.safeParse()` contract.

The remaining DEBT-400 work is explicit fixture overrides and adapter/app DTO rows that still provide placeholder IDs directly.

### D. Fakes are shape-permissive

The fake repositories accept string IDs and compare them directly. They do not validate inputs through `zUuid`, and they should not import controller schemas as a broad architectural reflex. Tightening every fake to validate inputs would couple application test helpers to adapter schemas and is a larger design choice.

For DEBT-400, the selected approach is:

1. factories/fakes must generate production-shaped IDs by default;
2. boundary-crossing fixture inputs must use UUID-valid values;
3. fakes remain behavior fakes, not schema validators, unless a later evidence-backed debt proves the permissiveness itself is causing false positives.

This avoids reintroducing archived DEBT-007 as incidental scope.

### E. The rule is still undocumented in the right auto-loaded place

`.claude/rules/testing.md` currently says to use factories and links to the process-env isolation rule, but it does not define fixture integrity for validated boundaries. `.claude/rules/fixture-integrity.md` does not exist. `docs/dev/dependency-update-protocol.md` mentions the jsdom PR #328 precedent but does not yet encode a schema-validation-major fixture-audit step for PR #330-style incidents.

This mirrors the SSOT issue already fixed in DEBT-395: the full rule must live in one scoped rule file, and `testing.md` should carry only a pointer.

---

## Classification

### BOUNDARY-CROSSING: Must Fix

Fix placeholder IDs when a value is assigned to any of these roles:

1. Any controller input/output field listed in the Shared Controller Boundary table.
2. Any fixture object, fake repository state, mocked SQL row, or repository row mapper that models a Drizzle UUID column listed in the Database UUID Columns table.
3. Any shared factory or fake-generated ID for domain entities that map to those UUID columns.
4. Any E2E helper test that mocks app database rows with `users.id`, `questions.id`, `choices.id`, `bookmarks.user_id`, or similar UUID columns.

Current target areas:

| Area | Examples from current sweep | Execution treatment |
|---|---|---|
| Controller tests | `src/adapters/controllers/question-controller.test.ts`, `question-view-controller.test.ts`, `practice-controller-*.test.ts`, `bookmark-controller.test.ts`, `billing-controller.test.ts` | Use `crypto.randomUUID()` for valid-path IDs. Keep explicit invalid UUID strings only in negative validation tests. |
| Adapter repository tests | `src/adapters/repositories/drizzle-*.test.ts`, row mapper tests, idempotency tests | Replace UUID-column row fixtures with generated UUIDs or named UUID variables. |
| App/browser tests mocking controller DTOs | `app/(app)/app/practice/**`, `app/(app)/app/questions/**`, `app/(app)/app/dashboard/page.test.tsx`, `app/(app)/app/history/**`, `app/(app)/app/bookmarks/page.test.tsx` | Replace mocked controller DTO fields with generated UUIDs while preserving readable variable names. |
| Application use-case tests using entity/port fixtures | `src/application/use-cases/**`, `src/application/shared/**` | Fix entity IDs and repository-returned DTOs that model UUID columns. Preserve pure branch sentinels only when they never model a DB/controller ID. |
| Shared factories/fakes | `src/domain/test-helpers/factories.ts`, `src/application/test-helpers/fakes/**` | Make generated/default IDs UUID-valid. Update tests that relied on deterministic `attempt-1` / `session-1` sequencing to capture returned IDs instead. |
| E2E helper tests with mocked DB rows | `tests/e2e/helpers/seed-test-user.test.ts`, `reset-e2e-user-state*.test.ts`, `reset-bookmarks-for-e2e-user*.test.ts` | Treat mocked SQL rows for app UUID columns as boundary-crossing. External Clerk IDs remain strings. |

### HARMLESS / DO NOT CHURN

Leave these alone unless a concrete boundary use is present:

- Clerk/Svix/Stripe provider identifiers: `user_...` when it is a Clerk user id, `cus_...`, `sub_...`, `evt_...`.
- `stripe_events.id`, `clerk_events.id`, `deleted_clerk_users.clerkUserId`, `pending_stripe_cancellations.eventId`, and other varchar provider/event IDs.
- Slugs, labels, `data-testid`, HTML ids, CSS selectors, and React-only keys.
- Pure component-only callback tokens when the component contract is generic string selection and the value is never reused as a controller or DB UUID.
- Negative validation tests whose whole purpose is proving that non-UUID input is rejected. Those should keep invalid values and name them accordingly (`invalidQuestionId`, etc.).
- Existing UUID literals where stability is intentional and readability is acceptable; do not churn only for style.

### Fix Shape

Use generated UUIDs with semantic names:

```typescript
const userId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();
```

Prefer shared factories once they emit valid defaults:

```typescript
const question = createQuestion();
const choice = createChoice({ questionId: question.id });
```

Do not use opaque hardcoded UUID literals as a blanket replacement. Do not replace harmless external IDs or slugs.

---

## Related-Class Sweep

Phase 5 looked for adjacent, concrete integrity failures:

- Non-UUID Zod boundaries: current non-UUID validators are enums, `z.string().email()`, `z.string().url()`, and datetime schemas. The datetime boundary drift is already tracked as [DEBT-397](./debt-397-datetime-boundary-type-normalization.md). Email/URL/enum invalid values found in tests are negative validation cases, not latent fixture drift.
- Seed data: the production seed path reads MDX content and inserts rows with database-generated UUID defaults. No evidence was found that `db/seed` or content fixtures insert placeholder UUID primary keys into production tables.
- Integration tests: no skipped or failing integration test was found whose concrete failure mode is non-UUID fixture validation drift. E2E helper unit tests do mock app UUID rows with placeholder IDs; those are the same DEBT-400 UUID class and stay in this doc.

No separate DEBT-402 is filed from this audit. A new debt file would be speculative.

---

## Required Remediation

Ship as split, reviewable PRs. The original four-PR plan is replaced because a 2,438-hit candidate set is too large for one "fixture sweep" PR, and duplicating rule text across `testing.md` and a new rule file would recreate the DEBT-395 documentation drift trap.

### PR 1 — Foundation: factories/fakes plus proof harness

Branch: `feat/debt-400-pr-1-fixture-uuid-sweep`

Scope:

- `src/domain/test-helpers/factories.ts`
- affected `src/domain/test-helpers/*.test.ts`
- fake repositories that generate IDs internally:
  - `src/application/test-helpers/fakes/fake-attempt-repository.ts`
  - `src/application/test-helpers/fakes/fake-practice-session-repository.ts`
  - `src/application/test-helpers/fakes/fake-user-repository.ts`
  - `src/application/test-helpers/fakes/fake-subscription-repository.ts`
- affected fake tests that relied on deterministic placeholder IDs
- one focused proof test that verifies generated factory/fake IDs pass the actual `zUuid.safeParse()` contract for the UUID-shaped fields they emit

Rules:

- Use `crypto.randomUUID()` for generated IDs.
- Preserve explicit override support.
- Do not make all fakes import controller schemas or validate every input in this PR.
- Capture returned IDs in assertions instead of expecting `attempt-1`, `session-1`, etc.

Status: shipped in PR #368 at `e7f1029a`.

### PR 2 — Adapter boundary fixture sweep

Branches:

- PR 2a: `feat/debt-400-pr-2-adapter-boundary-fixtures` (controllers/shared/jobs/gateways; shipped in PR #369 at `a98b5922`)
- PR 2b: `feat/debt-400-pr-2b-repository-fixtures` (repository row fixtures; implemented in the PR 2b branch, pending review/merge)

Scope:

- `src/adapters/controllers/**/*.test.ts`
- `src/adapters/repositories/**/*.test.ts`
- `src/adapters/shared/with-idempotency.test.ts`
- `src/adapters/jobs/**/*.test.ts`
- adapter gateway tests only where the field is an app UUID (`userId`), not a provider ID

Rules:

- Valid-path controller tests must use UUID-valid inputs for every `zUuid` field.
- Repository tests must use UUID-valid values for row fields modeling Drizzle `uuid()` columns.
- Negative validation tests keep invalid strings but should name them as invalid fixtures.

Proof:

- Existing controller validation tests still reject invalid UUIDs.
- Valid-path controller tests pass with generated UUIDs.
- Repository tests still pass without widening type assertions.

#### PR 2 pre-execution audit: adapter target list

Re-audited on 2026-05-28 from `dev` at `e7f1029a` after PR 1 merged. The `zUuid` controller-field list and Drizzle `uuid()` column list above remain current. The PR 2 file globs resolve to real files:

- `src/adapters/controllers/**/*.test.ts`
- `src/adapters/repositories/**/*.test.ts`
- `src/adapters/shared/with-idempotency.test.ts`
- `src/adapters/jobs/**/*.test.ts`
- `src/adapters/gateways/**/*.test.ts`

The classification below is the execution target list. Counts are candidate string-literal occurrences from an AST-assisted audit of ID-shaped test literals; final edit count may be lower when one semantic `const userId = crypto.randomUUID()` replaces several repeated literals. Do not treat provider/invalid counts as failures.

| File | FIX app-UUID | LEAVE provider | LEAVE invalid | Execution note |
|---|---:|---:|---:|---|
| `src/adapters/controllers/billing-controller.test.ts` | 5 | 2 | 0 | Fix app `user.id` / `userId`; leave `clerkUserId`. |
| `src/adapters/controllers/bookmark-controller.test.ts` | 4 | 0 | 1 | Fix auth/user fixtures; keep `not-a-uuid` rejection case. |
| `src/adapters/controllers/clerk-webhook-controller.test.ts` | 0 | 103 | 0 | Provider-only Clerk/Svix/email/customer sentinels; do not churn. |
| `src/adapters/controllers/create-action.test.ts` | 0 | 0 | 1 | Keep direct invalid schema test. |
| `src/adapters/controllers/practice-controller-exam-draft.test.ts` | 2 | 0 | 3 | Fix auth `userId`; keep invalid session/question/choice case. |
| `src/adapters/controllers/practice-controller-mark-and-count.test.ts` | 3 | 0 | 2 | Fix auth `userId`; keep invalid session/question case. |
| `src/adapters/controllers/practice-controller-session-lifecycle.test.ts` | 6 | 0 | 2 | Fix auth `userId` and valid-path `sessionId` output placeholders; keep invalid `bad` inputs. |
| `src/adapters/controllers/practice-controller-session-reads.test.ts` | 9 | 0 | 3 | Fix auth `userId` placeholders; keep invalid `sessionId` cases. |
| `src/adapters/controllers/question-controller-exam-timer.test.ts` | 3 | 0 | 0 | Fix valid-path question/choice/user IDs. |
| `src/adapters/controllers/question-controller.test.ts` | 14 | 0 | 3 | Fix auth, input, and output UUID placeholders; keep invalid input cases. |
| `src/adapters/controllers/question-view-controller.test.ts` | 40 | 0 | 1 | Fix question/choice/attempt/user fixtures; keep invalid question-id case. |
| `src/adapters/controllers/require-entitled-user-id.test.ts` | 2 | 0 | 0 | Fix app `users.id` fixtures. |
| `src/adapters/controllers/review-controller.test.ts` | 6 | 0 | 0 | Fix app `users.id` / use-case `userId` fixtures. |
| `src/adapters/controllers/shared/execute-idempotent.test.ts` | 6 | 0 | 0 | Fix `idempotency_keys.userId` fixtures. |
| `src/adapters/controllers/stats-controller.test.ts` | 3 | 0 | 0 | Fix app `users.id` / use-case `userId` fixtures. |
| `src/adapters/controllers/stripe-webhook-controller.test.ts` | 10 | 46 | 0 | Fix subscription/customer repo `userId`; leave Stripe event/customer/subscription IDs. |
| `src/adapters/controllers/tag-controller.test.ts` | 6 | 0 | 0 | Fix app user and tag UUID fixtures. |
| `src/adapters/gateways/clerk-auth-gateway.test.ts` | 0 | 20 | 0 | Provider-only Clerk/email IDs; PR 1 fake user defaults already cover generated app IDs. |
| `src/adapters/gateways/stripe-payment-gateway.test.ts` | 23 | 138 | 0 | Fix app `userId` / metadata `user_id`; leave Stripe/Clerk IDs and price IDs. |
| `src/adapters/gateways/stripe-subscription-canceler.test.ts` | 0 | 17 | 0 | Provider-only Stripe subscription IDs. |
| `src/adapters/gateways/stripe/stripe-checkout-sessions.test.ts` | 1 | 43 | 0 | Fix app `userId`; leave Stripe checkout/customer/price IDs. |
| `src/adapters/gateways/stripe/stripe-customers.test.ts` | 7 | 20 | 0 | Fix app `userId`, including malformed valid-path `user_`; leave Stripe/Clerk IDs. |
| `src/adapters/gateways/stripe/stripe-portal.test.ts` | 0 | 3 | 0 | Provider-only Stripe customer IDs. |
| `src/adapters/gateways/stripe/stripe-subscription-normalizer.test.ts` | 4 | 29 | 0 | Fix app metadata/user IDs; leave Stripe subscription/customer/price IDs. |
| `src/adapters/gateways/stripe/stripe-webhook-processor.test.ts` | 5 | 46 | 0 | Fix app metadata/user IDs; leave Stripe event/subscription/customer/price IDs. |
| `src/adapters/gateways/stripe/stripe-webhook-schemas.test.ts` | 0 | 7 | 0 | Provider-only Stripe webhook schema sentinel IDs. |
| `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` | 40 | 118 | 0 | Fix app `userId` values in local subscription/customer mappings; leave Stripe customer/subscription/price IDs. |
| `src/adapters/repositories/attempt-row-mappers.test.ts` | 4 | 0 | 0 | Fix attempt row UUID fields. |
| `src/adapters/repositories/drizzle-attempt-repository.test.ts` | 128 | 0 | 0 | Fix all attempt/question/session/choice/user row and query UUID fixtures. |
| `src/adapters/repositories/drizzle-bookmark-repository.test.ts` | 27 | 0 | 0 | Fix bookmark `userId` / `questionId` fixtures. |
| `src/adapters/repositories/drizzle-clerk-event-repository.test.ts` | 0 | 12 | 0 | Provider event IDs; do not churn. |
| `src/adapters/repositories/drizzle-deleted-clerk-user-repository.test.ts` | 0 | 8 | 0 | Clerk user IDs are varchar provider IDs; do not churn. |
| `src/adapters/repositories/drizzle-pending-stripe-cancellation-repository.test.ts` | 0 | 10 | 0 | Stripe event/customer IDs; do not churn. |
| `src/adapters/repositories/drizzle-practice-session-repository-question-state.test.ts` | 45 | 0 | 0 | Fix session/user/question/choice state UUID fixtures. |
| `src/adapters/repositories/drizzle-practice-session-repository-reads.test.ts` | 29 | 0 | 0 | Fix session/user/question UUID fixtures. |
| `src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts` | 23 | 0 | 0 | Fix session/user/question/choice UUID fixtures. |
| `src/adapters/repositories/drizzle-question-repository.test.ts` | 13 | 0 | 0 | Fix question/choice/tag/user UUID fixtures; slugs remain unchanged. |
| `src/adapters/repositories/drizzle-stripe-customer-repository.test.ts` | 9 | 12 | 0 | Fix app `userId`; leave Stripe customer IDs. |
| `src/adapters/repositories/drizzle-stripe-event-repository.test.ts` | 0 | 22 | 0 | Provider event IDs; do not churn. |
| `src/adapters/repositories/drizzle-subscription-repository.test.ts` | 19 | 35 | 0 | Fix `stripe_subscriptions.id` and `userId`; leave `stripeSubscriptionId` / `priceId`. |
| `src/adapters/repositories/drizzle-tag-repository.test.ts` | 6 | 0 | 0 | Fix tag UUID fixtures. |
| `src/adapters/repositories/drizzle-user-repository.test.ts` | 7 | 19 | 0 | Fix app `users.id`; leave `clerkUserId`. |
| `src/adapters/repositories/practice-session-params.test.ts` | 7 | 0 | 0 | Fix question/choice IDs embedded in practice-session params JSON. |
| `src/adapters/shared/with-idempotency.test.ts` | 31 | 0 | 0 | Fix `idempotency_keys.userId` fixtures; existing idempotency keys are already UUID-shaped where controller-like. |

Totals from the PR 2 audit table: **547 FIX**, **710 LEAVE-provider**, **16 LEAVE-invalid** candidate literal occurrences.

Controller validation exercise notes:

| Controller test file | Real validation exercised? | Note |
|---|---|---|
| `billing-controller.test.ts` | Yes, via `createAction` | Input only validates `plan` / optional `idempotencyKey`; app user placeholders are auth/use-case fixtures. |
| `bookmark-controller.test.ts` | Yes, via `createAction` | `questionId` negative test proves `zUuid` rejection. |
| `clerk-webhook-controller.test.ts` | No `zUuid` boundary | Tests provider webhook payload validation; provider IDs stay provider-shaped. |
| `create-action.test.ts` | Yes, direct schema | Keep invalid UUID test as the shared action validation proof. |
| `practice-controller-*.test.ts` | Yes, via `createAction` and exported practice schemas | Valid-path UUID placeholders should be UUID-valid; invalid tests stay invalid. |
| `question-controller*.test.ts` | Yes, via `createAction`; `submitAnswer` also parses idempotent output schema | Fix input/output/user placeholders that model `zUuid` or app UUIDs. |
| `question-view-controller.test.ts` | Yes for `getPreviousAttempt`; `getQuestionBySlug` has slug input but returns DB UUID-shaped question/choice data | Fix returned question/choice/attempt/user placeholders. |
| `require-entitled-user-id.test.ts` | Bypasses controller schema | Still fixes app `users.id` fixtures because they model the auth/domain user row. |
| `review-controller.test.ts`, `stats-controller.test.ts`, `tag-controller.test.ts` | Yes, but no `zUuid` input fields | Fix app auth/user/tag fixtures that model UUID columns. |
| `stripe-webhook-controller.test.ts` | No `zUuid` input boundary | Fix app `userId` in subscription/customer fake state; leave Stripe event/customer/subscription IDs. |

PR 2 proof method:

- Do not export private controller schemas just to add a standalone `safeParse()` harness. The controller tests already exercise real input schemas through `createAction`; adding exports would widen production/test API surface for little value.
- Keep existing negative tests (`not-a-uuid`, `bad`, `still-bad`, `also-bad`) invalid and assert `VALIDATION_ERROR` / rejection.
- Convert valid-path app UUID placeholders to semantic generated IDs, then assert against those variables instead of old literals.
- Repository tests must keep Drizzle row typing intact; do not use `as any`, widen row types, or relax expectations to hide invalid UUID fixtures.
- Run the adapter PR 2 slice directly, then the full local gate:

  ```sh
  pnpm test --run src/adapters/controllers src/adapters/repositories src/adapters/shared/with-idempotency.test.ts src/adapters/jobs src/adapters/gateways
  pnpm test --run tests/shared/fixture-uuid-integrity.test.ts
  pnpm test --run components/theme-token-regression.test.tsx
  ```

- Acceptance is not "zero placeholder-looking strings in adapters." Provider and invalid buckets above are expected to remain.

Split decision: PR 2 ships as **two PRs** on adapter-layer boundaries. PR 2a used `feat/debt-400-pr-2-adapter-boundary-fixtures` and shipped in PR #369 at `a98b5922`, covering controllers, `src/adapters/shared/with-idempotency.test.ts`, jobs, and gateways. PR 2b uses `feat/debt-400-pr-2b-repository-fixtures` for `src/adapters/repositories/**/*.test.ts`. The 2026-05-29 PR 2b table below supersedes the repository rows in the historical 44-row adapter table above.

#### PR 2b pre-execution audit: repository row-fixture target list

Re-audited on 2026-05-29 from `dev` at `a98b5922` after PR 2a merged. The authoritative schema path is `db/schema.ts`; no `src/adapters/db` schema exists. The repository slice resolves to these test files:

- `src/adapters/repositories/attempt-row-mappers.test.ts`
- `src/adapters/repositories/drizzle-*-repository.test.ts`
- `src/adapters/repositories/practice-session-params.test.ts`
- plus non-target repository tests with no fixture IDs: `index.test.ts`, `postgres-errors.test.ts`

Counts below are current candidate occurrences from a repository-slice AST/text audit. They are **not** expected edit counts: one named value such as `const userId = crypto.randomUUID()` may replace multiple repeated literals. The execution target is the `FIX uuid-column` column only.

| File | FIX uuid-column | LEAVE provider/text | LEAVE other / already valid | Execution note |
|---|---:|---:|---:|---|
| `src/adapters/repositories/attempt-row-mappers.test.ts` | 4 | 0 | 0 | Base attempt row models `attempts.id`, `userId`, `questionId`, `selectedChoiceId`; update error-message expectations by capturing `baseRow.id`, not by hardcoding the old literal. |
| `src/adapters/repositories/drizzle-attempt-repository.test.ts` | 136 | 0 | 0 | Near-pure FIX. Replace attempt/user/question/session/choice row mocks, query args, `answeredOutcome(...)` choice IDs, aggregate query result rows, and expected returned IDs with semantic UUID variables. |
| `src/adapters/repositories/drizzle-bookmark-repository.test.ts` | 27 | 0 | 0 | Near-pure FIX. `bookmarks.userId` / `questionId` appear in query args, insert/delete values, returned rows, and list assertions; capture shared `userId` / `questionId`. |
| `src/adapters/repositories/drizzle-clerk-event-repository.test.ts` | 0 | 12 | 0 | Provider/Svix event IDs only (`clerk_events.id` is varchar); do not churn. |
| `src/adapters/repositories/drizzle-deleted-clerk-user-repository.test.ts` | 0 | 8 | 0 | Clerk user IDs populate `deleted_clerk_users.clerkUserId` varchar; do not churn. |
| `src/adapters/repositories/drizzle-idempotency-key-repository.test.ts` | 0 | 0 | 13 already-valid `userId` UUID literals; idempotency `action` / `key` strings remain text | Corrected from the earlier directional "drizzle-idempotency ~32" concern: current app `userId` fixtures already use UUID-shaped values. PR 2b should not churn this file unless a test fails from nearby changes. |
| `src/adapters/repositories/drizzle-pending-stripe-cancellation-repository.test.ts` | 0 | 10 | 0 | Stripe/Svix event/customer text columns only; do not churn. |
| `src/adapters/repositories/drizzle-practice-session-repository-question-state.test.ts` | 102 | 0 | 0 | Near-pure FIX. Includes `practice_sessions.id` / `userId` row mocks, command inputs, `paramsJson.questionIds`, question-state `questionId`, `latestSelectedChoiceId`, `draftSelectedChoiceId`, and selected-choice values. |
| `src/adapters/repositories/drizzle-practice-session-repository-reads.test.ts` | 53 | 0 | 0 | Near-pure FIX. Includes read query args, returned session rows, `paramsJson.questionIds`, question-state rows, and orphan `questionId` fixtures; tag slugs remain ordinary slugs. |
| `src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts` | 39 | 0 | 0 | Near-pure FIX. Includes create/end query args, returned rows, `paramsJson.questionIds`, question-state `questionId`, and latest choice IDs. |
| `src/adapters/repositories/drizzle-question-repository.test.ts` | 16 | 0 | slugs unchanged | Fix question/choice/tag UUID row fields, `findPublishedByIds` placeholder IDs, and app `userId` status-filter fixtures. Keep `slug` values, tag names/kinds, and invalid status sentinels unchanged. |
| `src/adapters/repositories/drizzle-stripe-customer-repository.test.ts` | 9 | 12 | 0 | Surgical mixed file. Fix only app `userId` query/insert args; leave `cus_*` Stripe customer IDs provider-shaped. |
| `src/adapters/repositories/drizzle-stripe-event-repository.test.ts` | 0 | 22 | 0 | Stripe event IDs only (`stripe_events.id` is varchar); do not churn. |
| `src/adapters/repositories/drizzle-subscription-repository.test.ts` | 19 | 35 | 0 | Surgical mixed file. Fix `stripe_subscriptions.id` row IDs (`sub_row_1`) and app `userId`; leave `stripeSubscriptionId` (`sub_*`) and `priceId` (`price_*`) as provider/text values. |
| `src/adapters/repositories/drizzle-tag-repository.test.ts` | 6 | 0 | 0 | Near-pure FIX for `tags.id`; slugs/names/kinds remain text. |
| `src/adapters/repositories/drizzle-user-repository.test.ts` | 7 | 19 | 0 | Surgical mixed file. Fix app `users.id`; leave `clerkUserId` args/rows (`clerk_*`) provider-shaped. |
| `src/adapters/repositories/index.test.ts` | 0 | 0 | 0 | Barrel export test; no ID fixtures. |
| `src/adapters/repositories/postgres-errors.test.ts` | 0 | 0 | 0 | Error-shape test; no ID fixtures. |
| `src/adapters/repositories/practice-session-params.test.ts` | 10 | 0 | 0 | Fix `questionIds`, question-state `questionId`, and draft choice IDs embedded in practice-session params JSON. |

Repository PR 2b totals: **428 FIX uuid-column candidate occurrences**, **118 LEAVE provider/text occurrences**, and **13 already-valid app UUID literals** in `drizzle-idempotency-key-repository.test.ts`. `idempotency_keys.action` / `key`, slugs, labels, enum-ish status/action strings, and Postgres constraint names are expected text values, not debt.

Row-fixture mechanics and execution rules:

- Most repository tests use object-literal row mocks plus `db as unknown as RepoDb` to stand in for the injected Drizzle client. That DB seam cast is pre-existing and not the DEBT-400 target; PR 2b must not add `as any`, widen row object types, or relax expectations to make invalid fixtures compile.
- App-entity repository files (`drizzle-attempt`, `drizzle-practice-session-*`, `drizzle-bookmark`, `drizzle-question`, `drizzle-tag`, `attempt-row-mappers`, `practice-session-params`) are near-pure FIX. Prefer small semantic constants per test (`userId`, `sessionId`, `questionId`, `selectedChoiceId`) or local row factories when a value repeats across query args, mocked rows, and assertions.
- Stripe/Clerk repository files are column-level surgical edits. Fix app UUID columns (`users.id`, `stripe_customers.userId`, `stripe_subscriptions.id`, `stripe_subscriptions.userId`) and leave provider/text columns (`clerkUserId`, `stripeCustomerId`, `stripeSubscriptionId`, `priceId`, event IDs) unchanged.
- Capture-the-id sites are common: insert-then-expect returned row, query-by-id then assert returned row id, `toThrow('Attempt attempt-1 ...')`, and `toMatchObject([{ questionId: 'q_correct' }])`. The fix is to capture the generated semantic UUID and assert against that variable, not to introduce opaque UUID literals.

PR 2b proof method:

- Run `pnpm test --run src/adapters/repositories` after migration; all repository tests must pass with valid UUIDs in UUID-column fixtures and no new `as any` / row-type widening.
- Run `pnpm test --run tests/shared/fixture-uuid-integrity.test.ts` to keep PR 1's proof harness green.
- Run `pnpm test --run components/theme-token-regression.test.tsx` and confirm 16/16 still passes.
- Full local gate remains required before push. No extra production-schema export or standalone repository-row `safeParse()` harness is recommended; the repository tests already exercise the row mappers and Drizzle adapter behavior, and a harness would either duplicate the schema table manually or expose internals for test-only proof.
- Acceptance is not "zero placeholder-looking strings in repositories." Provider/text values and the already-valid idempotency UUID literals above are expected to remain.

PR 2b split decision: ship as **one repository PR** on `feat/debt-400-pr-2b-repository-fixtures`. Although the current repository FIX volume is about 428 candidate occurrences, the edits are mechanical, confined to `src/adapters/repositories/**/*.test.ts`, and reviewable with commits split by sub-area: attempt/practice-session bulk first, then question/bookmark/tag/user, then Stripe/Clerk surgical files. Splitting again would create more branch choreography without reducing conceptual scope.

PR 2b execution status: implemented in the repository-slice PR. The branch migrates only `FIX uuid-column` repository fixtures to UUID-valid values, preserves provider/text identifiers and the already-valid `drizzle-idempotency-key-repository.test.ts`, and leaves PR 3 plus PR 4 as the remaining DEBT-400 work.

### PR 3 — App, browser, and application fixture sweep

Branch: `feat/debt-400-pr-3-app-application-fixtures`

Scope:

- `app/**/*.test.ts`
- `app/**/*.test.tsx`
- `app/**/*.browser.spec.tsx`
- `components/**/*.test.tsx` and `components/**/*.browser.spec.tsx` only when the fixture models a controller/domain UUID, not pure UI tokens
- `src/application/use-cases/**/*.test.ts`
- `src/application/shared/**/*.test.ts`
- `tests/e2e/helpers/**/*.test.ts` for mocked app DB UUID rows

Rules:

- Replace mocked controller DTO IDs and entity/repository fixture IDs with generated UUIDs.
- Leave component-only tokens and external provider IDs alone.
- Keep assertions readable by assigning generated IDs to semantic variables.

Proof:

- The canonical grep may still return harmless/external/provider hits. The acceptance gate is that every remaining hit is either harmless by the boundary definition or intentionally invalid and documented by naming/context.

### PR 4 — Fixture-integrity rule docs (SSOT)

Branch: `feat/debt-400-pr-4-fixture-integrity-docs`

Canonical structure: **Option A**.

- Create `.claude/rules/fixture-integrity.md` as the single source of truth.
- Add only a short pointer section to `.claude/rules/testing.md`; do not duplicate the full rule body.
- Add the new rule file to the `CLAUDE.md` Path-Scoped Rules table.
- Update `docs/dev/dependency-update-protocol.md` with a Schema-Validation Majors fixture-audit step citing PR #330.
- Mark DEBT-400 complete in this doc, but archive it in a separate follow-up archive PR after PR 4 merges.

Recommended frontmatter for the new rule file:

```markdown
---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "tests/**"
  - "src/domain/test-helpers/**"
  - "src/application/test-helpers/**"
---
```

Rule content contract:

1. Fixtures must match production validators at any boundary.
2. UUID/GUID fields crossing `zUuid` or Drizzle `uuid()` columns must use `crypto.randomUUID()` or UUID-emitting factories.
3. Provider IDs, slugs, HTML ids, and intentionally invalid validation fixtures are not UUID fixtures.
4. Factories and fakes must emit production-shaped default IDs.
5. Schema-validation major upgrades must include a fixture audit before merge; cite PR #330.
6. Do not churn harmless existing sites for style consistency.

---

## Acceptance Criteria

PR 1 done when:

- Domain factories emit UUID-valid default IDs for fields that model Drizzle UUID columns.
- Fake repositories that generate application-owned IDs emit UUID-valid values.
- Tests no longer assert deterministic fake-generated placeholder IDs.
- A focused proof test exercises the actual `zUuid.safeParse()` helper against representative generated IDs.
- Full local gate green.

PR 2 done when:

- Valid-path adapter/controller tests use UUID-valid values for every `zUuid` field and app `users.id` auth fixture they model.
- Adapter repository row fixtures use UUID-valid values for every Drizzle `uuid()` column they model, including IDs embedded in practice-session params JSON.
- Gateway/job tests fix only app UUID fields such as `userId` / metadata `user_id`; provider IDs (`cus_`, `sub_`, `evt_`, `price_`, Clerk IDs) remain provider-shaped.
- Invalid UUID negative tests remain explicit and intentional.
- `tests/shared/fixture-uuid-integrity.test.ts` from PR 1 remains green.
- `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16.
- Full local gate green.

PR 3 done when:

- App/browser/application tests no longer use placeholder IDs for mocked controller DTOs or entity/repository fixtures that cross the boundary definition.
- Remaining canonical-grep hits are harmless/provider IDs, pure UI tokens, slugs, or intentionally invalid validation fixtures.
- `pnpm test --run --sequence.shuffle` stays green after the sweep.
- Full local gate green.

PR 4 done when:

- `.claude/rules/fixture-integrity.md` exists with the SSOT rule.
- `.claude/rules/testing.md` has only a pointer to the rule, not a duplicated body.
- `CLAUDE.md` lists the new path-scoped rule.
- `docs/dev/dependency-update-protocol.md` records the schema-validation-major fixture-audit step.
- Full local gate green.

Cross-PR sanity:

- `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16.
- No DEBT-398 design-system scan surfaces are modified.
- After PR 4 merges, archive DEBT-400 in a separate doc-only archive PR.

---

## Risk and Reversibility

- **PR 1:** medium risk because factories/fakes are widely reused and some tests intentionally relied on deterministic `attempt-1` / `session-1` sequences. Failures should be loud and local: capture returned IDs instead of asserting generated literals.
- **PR 2:** medium risk in adapter tests because repository fixtures often mirror SQL rows. Keep changes mechanical and boundary-scoped.
- **PR 3:** medium risk because app/browser fixture graphs are broad. Split commits by directory and rerun affected tests frequently.
- **PR 4:** doc-only; low risk.

All PRs are independently revertible.

---

## Done When

All four PRs merge to `dev` and sync to `main`; the dedicated fixture-integrity rule is live; `testing.md` points to it without duplicating the body; factories/fakes emit UUID-valid defaults; boundary-crossing fixtures use UUID-valid values; remaining placeholder-ID grep hits are documented harmless classes; full local gate is green; DEBT-400 is archived with a resolution paragraph naming the PRs.
