# DEBT-400: Test Fixture Integrity (Zod Boundary Class)

**Priority:** P2 (latent bug class. After PR 3b, the current canonical candidate grep finds 748 remaining placeholder-ID assignments across 42 files repo-wide, with 729 across 38 PR 3 residual app/application files. This is a candidate set, not a mandate to replace every string: the execution scope is only IDs that cross `zUuid = z.guid()` controller schemas or real Drizzle `uuid()` columns.)
**Created:** 2026-05-26
**Source:** Deep schema/boundary integrity audit conducted alongside DEBT-394 archival; re-audited on 2026-05-28 from `dev` at `f2dc0793`, PR 2 scope re-audited on 2026-05-28 from `dev` at `e7f1029a` after PR 1 merged, repository-slice PR 2b scope re-audited on 2026-05-29 from `dev` at `a98b5922` after PR 2a merged, app/browser/application PR 3 scope re-audited on 2026-05-29 from `dev` at `3b225505` after PR 2b merged, browser-slice PR 3b scope re-audited on 2026-05-30 from `dev` at `895d03a5` after PR 3a merged, application-slice PR 3c value re-evaluated on 2026-05-30 from `dev` at `f39171f8` after PR 3b merged, and PR 4 guardrail scope audited on 2026-05-30 from the PR 3c audit tip at `d97df8c7`. Direct precedent is PR #330, which bumped Zod from 3 to 4 and deliberately kept historical UUID/GUID behavior by replacing the shared controller ID schema with Zod 4 `z.guid()`.
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
rg -n "\b(questionId|sessionId|attemptId|choiceId|selectedChoiceId|correctChoiceId|retryOfAttemptId|retrySessionId|userId|tagId|subscriptionId|idempotencyKey|question_id|session_id|attempt_id|choice_id|selected_choice_id|correct_choice_id|retry_of_attempt_id|retry_session_id|user_id|tag_id|subscription_id|idempotency_key|id)\s*[:=]\s*['\"](q|question|choice|session|attempt|user|db_user|tag|subscription|test|mock|fake|other|correct|incorrect|bookmark)[_-][A-Za-z0-9_-]+['\"]" \
  app/ src/ components/ tests/ \
  --glob '*.test.ts' --glob '*.test.tsx' --glob '*.spec.ts' --glob '*.spec.tsx' \
  --glob '!**/_archive/**'
```

Current result on `f39171f8` after PR 3b: **748 lines across 42 files** repo-wide. The remaining PR 3 residual slice (`app/`, `components/`, `src/application/`, `tests/e2e/helpers/`) is **729 lines across 38 files**. The browser-spec canonical count is now **0 lines across 0 files**. The `src/application/use-cases/**` plus `src/application/shared/**` slice is still **579 lines across 27 files**, and `src/application/test-helpers/fakes/*.test.ts` is still **142 lines across 7 files**; the PR 3c value re-evaluation below classifies both as LEAVE. Historical result on `895d03a5` after PR 3a was **1,349 lines across 82 files** repo-wide and **1,330 lines across 78 PR 3 slice files**. Historical result on `3b225505` after PR 2b was **2,040 lines across 129 files**, with the PR 3 slice accounting for **2,021 lines across 125 files** before PR 3a shipped. The result on `a98b5922` after PR 2a was **2,244 lines across 140 files** with the earlier command that did not include the `db_user` E2E-helper prefix. The result on `e7f1029a` after PR 1 was **2,438 lines across 162 files**. The pre-PR1 audit result on `f2dc0793` was **2,447 lines across 163 files**.

This replaces the old narrower `604 / 64` count. The old grep only searched `app/ src/ components/`, only camel-case object properties, only five field names, and only underscore-prefixed values. It missed hyphenated placeholders (`session-1`), choice/tag/subscription fields, snake_case SQL-row fixtures (`user_id`), E2E app-user sentinels such as `db_user_123`, and `tests/**` helper fixtures.

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

The broad candidate set is now 748 lines across 42 files after PR 3b. The remaining PR 3 residual slice is 729 candidate lines across 38 files. PRs 3a and 3b removed the real app/browser boundary-crossing fixture classes. The remaining hits are intentionally harmless under the boundary definition or are application/fake behavior-test keys that do not cross a real adapter/schema boundary at unit-test time:

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

After PR 1, the remaining code-sweep work was explicit fixture overrides and adapter/app DTO rows that still provided placeholder IDs directly.

### D. Fakes are shape-permissive

The fake repositories accept string IDs and compare them directly. They do not validate inputs through `zUuid`, and they should not import controller schemas as a broad architectural reflex. Tightening every fake to validate inputs would couple application test helpers to adapter schemas and is a larger design choice.

For DEBT-400, the selected approach is:

1. factories/fakes must generate production-shaped IDs by default;
2. boundary-crossing fixture inputs must use UUID-valid values;
3. fakes remain behavior fakes, not schema validators, unless a later evidence-backed debt proves the permissiveness itself is causing false positives.

This avoids reintroducing archived DEBT-007 as incidental scope.

### E. PR 4 documents the rule in the right auto-loaded place

Before PR 4, `.claude/rules/testing.md` said to use factories and linked to the process-env isolation rule, but it did not define fixture integrity for validated boundaries. PR 4 resolves this with `.claude/rules/fixture-integrity.md` as the SSOT, a pointer-only `testing.md` section, a `CLAUDE.md` path-scoped row, and a schema-validation-major fixture-audit step in `docs/dev/dependency-update-protocol.md`.

This mirrors the SSOT issue already fixed in DEBT-395: the full rule must live in one scoped rule file, and `testing.md` should carry only a pointer.

---

## Classification

### BOUNDARY-CROSSING: Must Fix

Fix placeholder IDs when a value is assigned to any of these roles:

1. Any controller input/output field listed in the Shared Controller Boundary table.
2. Any adapter repository row fixture, mocked SQL row, or repository row mapper that models a Drizzle UUID column listed in the Database UUID Columns table.
3. Any shared factory or fake-generated ID for domain entities that map to those UUID columns.
4. Any E2E helper test that mocks app database rows with `users.id`, `questions.id`, `choices.id`, `bookmarks.user_id`, or similar UUID columns.

Current target areas:

| Area | Examples from current sweep | Execution treatment |
|---|---|---|
| Controller tests | `src/adapters/controllers/question-controller.test.ts`, `question-view-controller.test.ts`, `practice-controller-*.test.ts`, `bookmark-controller.test.ts`, `billing-controller.test.ts` | Use `crypto.randomUUID()` for valid-path IDs. Keep explicit invalid UUID strings only in negative validation tests. |
| Adapter repository tests | `src/adapters/repositories/drizzle-*.test.ts`, row mapper tests, idempotency tests | Replace UUID-column row fixtures with generated UUIDs or named UUID variables. |
| App/browser tests mocking controller DTOs | `app/(app)/app/practice/**`, `app/(app)/app/questions/**`, `app/(app)/app/dashboard/page.test.tsx`, `app/(app)/app/history/**`, `app/(app)/app/bookmarks/page.test.tsx` | Replace mocked controller DTO fields with generated UUIDs while preserving readable variable names. |
| Application use-case tests using fake-backed entity/port fixtures | `src/application/use-cases/**`, `src/application/shared/**` | **LEAVE after PR 3c value re-evaluation.** These unit tests do not import adapter schemas, Drizzle, or `zUuid`; they exercise use cases behind fakes and domain factories. UUID-ifying dense cross-reference keys would buy production-shape consistency only, not active boundary protection. Reclassify only if a specific test starts calling a real adapter/schema boundary. |
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
- Mocked DTO type drift: three current tests bypass output DTO typing with `as unknown as ...Output` while supplying impossible shapes (`{ ok: true }` as `GetPracticeSessionReviewOutput`, and a tag row with unsupported `kind: 'domain'` cast to `GetTagsOutput`). This is concrete, evidence-backed, and separate from UUID fixture validity, so it is filed as [DEBT-402](./debt-402-mocked-dto-type-assertion-drift.md).

No other separate debt is filed from this audit. The remaining observations are either already covered by DEBT-397 or are negative-test/provider fixtures with no independent failure mode.

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
- PR 2b: `feat/debt-400-pr-2b-repository-fixtures` (repository row fixtures; shipped in PR #370 at `3b225505`)

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

PR 2b status: shipped in PR #370 at `3b225505`. The repository-slice PR migrated only `FIX uuid-column` repository fixtures to UUID-valid values, preserved provider/text identifiers and the already-valid `drizzle-idempotency-key-repository.test.ts`, and left PR 3 plus PR 4 as the remaining DEBT-400 work.

### PR 3 — App, browser, and application fixture sweep

Root audit branch: `feat/debt-400-pr-3-app-application-fixtures`

Execution status: current from `dev` at `f39171f8` after PR 3b merged, plus the PR 3c skip audit at `d97df8c7` and the PR 4 scope audit at `5d53acee`. PRs 1, 2a, 2b, 3a, and 3b are merged. The PR 3c application-slice value re-evaluation below finds no genuine boundary-crossing unit-test fixtures worth fixing. PR 4 ships the durable rule guardrail; after it merges, remaining work is DEBT-402, then the DEBT-400 archive PR.

#### PR 3 candidate count

Use the canonical command above. For the PR 3 slice, run it against:

```sh
app/ components/ src/application/ tests/e2e/helpers/
```

Historical result before PR 3a: **2,021 candidate lines across 125 files**.

Historical result on `895d03a5` after PR 3a: **1,330 candidate lines across 78 files**.

Current result on `f39171f8` after PR 3b: **729 candidate lines across 38 files**.

Breakdown:

| Slice | Candidate lines | Files | Decision |
|---|---:|---:|---|
| App/components non-browser tests plus E2E helper unit tests | 8 | 4 | PR 3a shipped in PR #371 at `895d03a5`. Remaining hits are expected LEAVE cases: DEBT-398 regression fixture strings and provider-shaped Clerk IDs in E2E helper tests. |
| App/components browser specs | 0 | 0 | PR 3b shipped in PR #372 at `f39171f8`; browser canonical hits are closed. |
| `src/application/use-cases/**` and `src/application/shared/**` | 579 | 27 | PR 3c value re-evaluation: **LEAVE**. These are fake-backed application unit-test cross-reference graphs, not active boundary tests. |
| `src/application/test-helpers/fakes/*.test.ts` | 142 | 7 | Tier 3 LEAVE. These are fake behavior tests with semantic internal keys; PR 1 already fixed fake-generated defaults. |

#### Value-tier decision

**Tier 1 - FIX:** app, component, browser, and E2E helper unit-test fixtures that mock controller DTOs, app-auth users, or app DB rows. These tests usually bypass the real `zUuid` parser through fakes or mocked controller functions; if pointed at real controller outputs/inputs, placeholders like `question-1`, `choice_1`, `session-1`, and `attempt_1` would fail the same boundary contract PRs 1/2 fixed.

**Tier 2 - LEAVE after value re-evaluation:** application use-case/shared tests whose entity and port fixtures use readable cross-reference keys (`q1`, `c1`, `session-1`, `attempt-parent`, etc.) behind fakes. These do not hit adapter schemas or Drizzle at unit-test time; no current file in this slice imports `zUuid`, `db/schema`, Drizzle, Postgres, or adapter controllers. UUID-ifying them would provide production-shape consistency/future-refactor defense only, while making dense entity graphs harder to read. That does not clear the no-speculative-debt bar. If a specific application unit test later starts calling a real controller schema, repository implementation, or DB boundary, reclassify only that fixture.

**Tier 3 - LEAVE:** fake-repository **test files** under `src/application/test-helpers/fakes/*.test.ts`. These tests assert fake-specific behavior such as active-exam visibility with readable semantic keys (`attempt-active-exam`, `q-ended-exam`, `session-tutor`). They never cross a real controller or database boundary, and PR 1 already proved the fakes' internally generated IDs are UUID-valid. Churning these behavior-test keys would reduce readability with near-zero boundary-risk reduction. If a fake test imports a real controller schema later, reclassify that specific fixture.

**LEAVE:** provider IDs (`cus_`, `sub_`, `evt_`, `price_`, Clerk `user_...`, Svix), slugs, labels, HTML ids, `data-testid`, React-only keys, and intentionally invalid negative-validation fixtures.

Cross-reference-key handling rule: many application tests deliberately use linked placeholders (`id: 'q1'` with `questionId: 'q1'`, or `selectedChoiceId: 'c2'` with a `createChoice({ id: 'c2' })`). Because PR 3c is now skipped, keep these readable keys. If a future genuine boundary-crossing application test appears, do **not** blindly replace each literal independently. Introduce role-bearing variables once (`const questionId = crypto.randomUUID(); const correctChoiceId = crypto.randomUUID();`) and reuse them everywhere the same entity relationship is intended.

#### PR 3 per-file classification table

Candidate counts are grep hits, not exact edit counts. One semantic UUID variable can replace many repeated literals. Execution agents must read each file and keep provider/component-only/invalid fixtures where noted.

| PR | File | Hits | Classification | Execution note |
|---|---|---:|---|---|
| 3a | `app/(app)/app/billing/page.test.tsx` | 5 | Tier 1 FIX | `createUser({ id: 'user_1' })` app user fixtures. |
| 3a | `app/(app)/app/bookmarks/page.test.tsx` | 10 | Tier 1 FIX | Bookmark controller/app question IDs and app auth user fixtures. |
| 3a | `app/(app)/app/dashboard/page.test.tsx` | 22 | Tier 1 FIX | Dashboard controller DTO rows for attempts/questions/sessions; preserve links via named IDs. |
| 3a | `app/(app)/app/history/components/history-questions-tab.test.tsx` | 21 | Tier 1 FIX | Attempted-question DTO rows; session/question IDs are app UUID shape. |
| 3a | `app/(app)/app/history/components/history-sessions-tab.test.tsx` | 14 | Tier 1 FIX | Session-history/review DTO rows; preserve row-to-review linkage. |
| 3a | `app/(app)/app/history/page.test.tsx` | 15 | Tier 1 FIX plus LEAVE slugs | History controller DTO rows; tag IDs that model `tags.id` fix, tag slugs/kinds stay. |
| 3a | `app/(app)/app/layout.test.ts` | 3 | Tier 1 FIX | App user/auth fixtures. |
| 3a | `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` | 2 | Tier 1 FIX | Review DTO session ID fixtures. |
| 3a | `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx` | 12 | Tier 1 FIX | Completed-session feedback DTO question/choice IDs; preserve choice linkage. |
| 3a | `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.test.tsx` | 3 | Tier 1 FIX | Session/review DTO IDs. |
| 3a | `app/(app)/app/practice/[sessionId]/components/practice-session-question-navigation.test.ts` | 1 | Tier 1 FIX | Review navigation session ID. |
| 3a | `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` | 18 | Tier 1 FIX | Session summary DTO rows and links. |
| 3a | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.test.tsx` | 1 | Tier 1 FIX | Session ID fixture. |
| 3a | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.test.tsx` | 13 | Tier 1 FIX | Mark-for-review controller input/output session/question IDs. |
| 3a | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator.test.tsx` | 1 | Tier 1 FIX | Review navigator session ID. |
| 3a | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.test.tsx` | 4 | Tier 1 FIX | Submit-answer output/session fixtures. |
| 3a | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.test.tsx` | 2 | Tier 1 FIX | Review-stage session IDs. |
| 3a | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review.test.tsx` | 1 | Tier 1 FIX | Summary-review session ID. |
| 3a | `app/(app)/app/practice/[sessionId]/page.test.tsx` | 31 | Tier 1 FIX | Route params and mocked controller/session DTOs; use one `sessionId` variable when values are linked. |
| 3a | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 78 | Tier 1 FIX | Page-logic controller DTO/input fixtures; also replace the two impossible DTO casts tracked separately by DEBT-402 when that debt executes. |
| 3a | `app/(app)/app/practice/components/practice-session-starter.test.tsx` | 7 | Tier 1 FIX plus LEAVE slugs | Tag DTO `id` values fix; tag slugs/names/kinds stay. |
| 3a | `app/(app)/app/practice/components/practice-view-answer-feedback.test.tsx` | 8 | Tier 1 FIX | PracticeView props model controller question/submit-result DTOs. |
| 3a | `app/(app)/app/practice/components/practice-view-bookmarks.test.tsx` | 8 | Tier 1 FIX | PracticeView props/bookmark interactions with session/attempt IDs. |
| 3a | `app/(app)/app/practice/components/practice-view-exam-actions.test.tsx` | 3 | Tier 1 FIX | Session/attempt prop fixtures. |
| 3a | `app/(app)/app/practice/components/practice-view-layout.test.tsx` | 8 | Tier 1 FIX | Question/session prop fixtures. |
| 3a | `app/(app)/app/practice/components/practice-view-navigation.test.tsx` | 13 | Tier 1 FIX | Session/attempt navigation prop fixtures. |
| 3a | `app/(app)/app/practice/hooks/use-practice-question-answer-flow.test.tsx` | 4 | Tier 1 FIX | Submit-answer output fixtures. |
| 3a | `app/(app)/app/practice/page.test.tsx` | 17 | Tier 1 FIX | Practice page controller/question/submit-result fixtures. |
| 3a | `app/(app)/app/practice/practice-page-incomplete-session.test.ts` | 9 | Tier 1 FIX | Incomplete-session/start-session controller DTOs; `idempotencyKey` must be UUID-valid when passed to controller-shaped input. |
| 3a | `app/(app)/app/practice/practice-page-logic-answer-flow.test.ts` | 27 | Tier 1 FIX | Submit-answer output and selected-choice linkage. |
| 3a | `app/(app)/app/practice/practice-page-logic-bookmarks.test.ts` | 3 | Tier 1 FIX | Bookmark/question controller IDs. |
| 3a | `app/(app)/app/practice/practice-page-logic-loading.test.ts` | 3 | Tier 1 FIX | Loaded question DTO IDs. |
| 3a | `app/(app)/app/practice/practice-page-logic-session-start.test.ts` | 3 | Tier 1 FIX | Start-session controller output IDs. |
| 3a | `app/(app)/app/practice/shared/question-flow-actions.test.ts` | 86 | Tier 1 FIX | Shared controller-flow DTOs; keep result/question cross-links by named IDs. |
| 3a | `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx` | 1 | Tier 1 FIX | Review navigator session ID. |
| 3a | `app/(app)/app/questions/[slug]/page.test.tsx` | 5 | Tier 1 FIX | Question page DTO IDs. |
| 3a | `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 44 | Tier 1 FIX plus LEAVE component-only only if verified local | Question/review DTO props and `sessionId` props; preserve existing href-selector fixes from DEBT-396. |
| 3a | `app/(app)/app/questions/[slug]/question-page-logic.test.ts` | 81 | Tier 1 FIX | Question page logic controller DTOs and submit-result outputs. |
| 3a | `app/(app)/app/shared/bookmark-toggle.test.ts` | 4 | Tier 1 FIX | Bookmark toggle question DTO IDs. |
| 3a | `app/(app)/app/shared/components/session-breakdown-list.test.tsx` | 2 | Tier 1 FIX | Session list DTO IDs. |
| 3a | `app/(marketing)/checkout/success/page.test.ts` | 28 | Tier 1 FIX plus LEAVE provider | App `users.id` and Stripe metadata `user_id` fix; `cus_*`, `sub_*`, `price_*`, Clerk IDs stay provider-shaped. |
| 3a | `app/pricing/page.test.tsx` | 3 | Tier 1 FIX | App auth user fixtures; provider price IDs stay if present. |
| 3a | `components/auth-nav.test.tsx` | 5 | Tier 1 FIX | Auth user fixtures model `users.id`. |
| 3a | `components/question/Feedback.test.tsx` | 19 | Tier 1 FIX if DTO-shaped, otherwise LEAVE component-token | Feedback IDs model choice/submit-result linkage; preserve selected/correct-choice relationships. |
| 3a | `components/question/question-surface-body.test.tsx` | 7 | Tier 1 FIX if DTO-shaped, otherwise LEAVE component-token | Choice IDs model question/feedback props; keep selected/correct linkage. |
| 3a | `components/theme-token-regression.test.tsx` | 2 | LEAVE component/regression fixture | DEBT-398 source-scan fixture strings, not controller/DB boundary. Do not touch in PR 3. |
| 3a | `tests/e2e/helpers/credential-health-check.test.ts` | 4 | LEAVE provider | Clerk `user_123` from Clerk API response/password verifier; not app `users.id`. |
| 3a | `tests/e2e/helpers/e2e-reset-shared.test.ts` | 1 | Tier 1 FIX plus LEAVE provider | Mock SQL `users.id` app row fixes; Clerk `clerk_user_*` stays provider-shaped. |
| 3a | `tests/e2e/helpers/reset-bookmarks-for-e2e-user.default-services.test.ts` | 3 | Tier 1 FIX | Mock SQL `questions.id` rows. |
| 3a | `tests/e2e/helpers/reset-bookmarks-for-e2e-user.test.ts` | 3 | Tier 1 FIX plus LEAVE provider | App `db_user_123` / question fixtures fix; Clerk `user_123` stays provider-shaped. |
| 3a | `tests/e2e/helpers/reset-e2e-user-state.test.ts` | 4 | Tier 1 FIX plus LEAVE provider | App `db_user_123`, question, and choice fixtures fix; Clerk `user_123` stays provider-shaped. |
| 3a | `tests/e2e/helpers/seed-test-user.test.ts` | 28 | Tier 1 FIX plus LEAVE provider | Mock SQL `users.id` and Stripe metadata `user_id` fix; `cus_*`, `sub_*`, `clerk_user_*`, and `price_*` stay provider-shaped. |
| 3b | `app/(app)/app/history/components/history-questions-tab.browser.spec.tsx` | 1 | Tier 1 FIX | Browser DTO question ID. |
| 3b | `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx` | 17 | Tier 1 FIX | Browser session/review DTO IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx` | 11 | Tier 1 FIX | Browser review DTO session IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx` | 8 | Tier 1 FIX | Completed-session browser DTO question/choice IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx` | 7 | Tier 1 FIX | Browser page-view session/question DTO IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-focus-restoration.browser.spec.tsx` | 4 | Tier 1 FIX | Browser page-view session IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-question-navigation.browser.spec.tsx` | 25 | Tier 1 FIX | Browser navigation session/question IDs, including missing-question sentinel if it is controller-shaped. |
| 3b | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-results.browser.spec.tsx` | 5 | Tier 1 FIX | Browser results session IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-review-stage.browser.spec.tsx` | 6 | Tier 1 FIX | Browser review-stage session IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx` | 14 | Tier 1 FIX | Browser summary DTO session IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.browser.spec.tsx` | 1 | Tier 1 FIX | Browser hook session ID. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.browser.spec.tsx` | 16 | Tier 1 FIX | Browser hook session/question IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller-answer-flow.browser.spec.tsx` | 40 | Tier 1 FIX | Controller-answer browser DTO/input IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller-bookmark-mark.browser.spec.tsx` | 13 | Tier 1 FIX | Bookmark/mark browser controller IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller-init-load.browser.spec.tsx` | 10 | Tier 1 FIX | Init-load review/question DTO IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller-review-stage.browser.spec.tsx` | 21 | Tier 1 FIX | Review-stage controller DTO IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller-timer.browser.spec.tsx` | 2 | Tier 1 FIX | Timer controller session/question IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow-click-commit.browser.spec.tsx` | 31 | Tier 1 FIX | Submit-answer browser output/input IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.browser.spec.tsx` | 63 | Tier 1 FIX | Broad question-flow browser DTO graph; preserve choice/question/session linkages. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.browser.spec.tsx` | 5 | Tier 1 FIX | Review-stage state session IDs. |
| 3b | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx` | 32 | Tier 1 FIX | Review-stage browser DTO IDs. |
| 3b | `app/(app)/app/practice/components/incomplete-session-card.browser.spec.tsx` | 2 | Tier 1 FIX | Incomplete-session card session IDs. |
| 3b | `app/(app)/app/practice/components/practice-session-starter.browser.spec.tsx` | 1 | Tier 1 FIX plus LEAVE slugs | Tag DTO `id` fix; slugs stay. |
| 3b | `app/(app)/app/practice/components/practice-view-notification.browser.spec.tsx` | 1 | Tier 1 FIX | Practice question DTO ID. |
| 3b | `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | 55 | Tier 1 FIX | PracticeView browser props model controller DTOs; preserve selected/correct choice linkage. |
| 3b | `app/(app)/app/practice/hooks/use-practice-question-answer-flow.browser.spec.tsx` | 32 | Tier 1 FIX | Browser submit-answer and next-question DTOs. |
| 3b | `app/(app)/app/practice/hooks/use-practice-question-bookmarks.browser.spec.tsx` | 2 | Tier 1 FIX | Bookmark question IDs. |
| 3b | `app/(app)/app/practice/hooks/use-practice-question-flow.browser.spec.tsx` | 2 | Tier 1 FIX | Browser submit-result IDs. |
| 3b | `app/(app)/app/practice/hooks/use-practice-session-controls.browser.spec.tsx` | 1 | Tier 1 FIX plus LEAVE slugs | Tag DTO `id` fix; slugs stay. |
| 3b | `app/(app)/app/practice/hooks/use-practice-session-start.browser.spec.tsx` | 3 | Tier 1 FIX | Start-session controller output IDs. |
| 3b | `app/(app)/app/practice/shared/use-question-flow-core.browser.spec.tsx` | 23 | Tier 1 FIX | Shared flow browser DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-bookmarks.browser.spec.tsx` | 4 | Tier 1 FIX | Browser question/bookmark DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-controller-bookmarks.browser.spec.tsx` | 27 | Tier 1 FIX | Browser question/previous-attempt/bookmark DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-controller-retry-reveal.browser.spec.tsx` | 24 | Tier 1 FIX | Retry/reveal browser DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-controller-review-hydration.browser.spec.tsx` | 26 | Tier 1 FIX | Review hydration browser DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-controller-session-navigation.browser.spec.tsx` | 24 | Tier 1 FIX | Session navigation browser DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-controller-stale-responses.browser.spec.tsx` | 20 | Tier 1 FIX | Stale-response browser DTO IDs; preserve q1/q2 distinction with semantic UUID variables. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-previous-attempt.browser.spec.tsx` | 13 | Tier 1 FIX | Previous-attempt browser DTO IDs. |
| 3b | `app/(app)/app/questions/[slug]/use-question-page-session-navigation.browser.spec.tsx` | 4 | Tier 1 FIX | Browser session-navigation question IDs. |
| 3b | `components/question/QuestionCard.browser.spec.tsx` | 5 | Tier 1 FIX if DTO-shaped, otherwise LEAVE component-token | QuestionCard browser choice IDs and correct-choice linkage. |
| 3c | `src/application/shared/enrich-with-question.test.ts` | 15 | LEAVE cross-ref-key | Question entity/row IDs and row-question linkage. |
| 3c | `src/application/shared/shuffled-choice-views.test.ts` | 31 | LEAVE cross-ref-key | Question/choice/user entity fixtures; preserve choice ordering/linkage. |
| 3c | `src/application/use-cases/check-entitlement.test.ts` | 15 | LEAVE cross-ref-key | App user/subscription use-case fixtures. |
| 3c | `src/application/use-cases/count-available-questions.test.ts` | 3 | LEAVE cross-ref-key | Tag/user fixtures; slugs stay. |
| 3c | `src/application/use-cases/create-checkout-session.test.ts` | 17 | LEAVE cross-ref-key plus LEAVE provider | Fake-backed app `userId`/subscription keys stay readable; Stripe customer/price/provider IDs stay provider-shaped. |
| 3c | `src/application/use-cases/create-portal-session.test.ts` | 2 | LEAVE cross-ref-key | App user ID fixtures. |
| 3c | `src/application/use-cases/end-practice-session.test.ts` | 18 | LEAVE cross-ref-key | Practice session/user fixtures; preserve session lookup. |
| 3c | `src/application/use-cases/finalize-exam-answers.test.ts` | 27 | LEAVE cross-ref-key | Session/user/question/choice/attempt fixtures; preserve exam answer linkage. |
| 3c | `src/application/use-cases/get-attempted-questions.test.ts` | 76 | LEAVE cross-ref-key | Attempt/question/session/user entity fixtures. |
| 3c | `src/application/use-cases/get-bookmarks.test.ts` | 4 | LEAVE cross-ref-key | Bookmark user/question fixtures, except `missing` sentinel stays if it is explicit absent-key behavior and never DB-shaped. |
| 3c | `src/application/use-cases/get-completed-session-questions-with-feedback.test.ts` | 10 | LEAVE cross-ref-key | Completed-session attempt/question/choice fixtures. |
| 3c | `src/application/use-cases/get-incomplete-practice-session.test.ts` | 14 | LEAVE cross-ref-key | Practice session/user fixtures. |
| 3c | `src/application/use-cases/get-next-question-fallback.test.ts` | 12 | LEAVE cross-ref-key | Question/choice/attempt fixtures; preserve old/new question distinction. |
| 3c | `src/application/use-cases/get-practice-session-review.test.ts` | 18 | LEAVE cross-ref-key | Review session/user/question/choice fixtures. |
| 3c | `src/application/use-cases/get-practice-session-summary.test.ts` | 8 | LEAVE cross-ref-key | Session/user fixtures and missing-session sentinel if DB-shaped. |
| 3c | `src/application/use-cases/get-previous-attempt.test.ts` | 110 | LEAVE cross-ref-key | Highest-volume fake-backed cross-reference graph; keep readable q/c/session/attempt/user relationships. |
| 3c | `src/application/use-cases/get-session-history.test.ts` | 32 | LEAVE cross-ref-key | Session/user history fixtures. |
| 3c | `src/application/use-cases/get-user-stats.test.ts` | 10 | LEAVE cross-ref-key | App user/attempt count fixtures. |
| 3c | `src/application/use-cases/practice-session-summary.test.ts` | 11 | LEAVE cross-ref-key | Session/user fixtures. |
| 3c | `src/application/use-cases/save-exam-draft-answer.test.ts` | 59 | LEAVE cross-ref-key | Session/question/choice/user draft fixtures; preserve draft choice linkage. |
| 3c | `src/application/use-cases/set-practice-session-question-mark.test.ts` | 13 | LEAVE cross-ref-key | Session/user/question fixtures. |
| 3c | `src/application/use-cases/start-practice-session.test.ts` | 10 | LEAVE cross-ref-key plus LEAVE slugs | User/tag/question fixtures; tag slugs stay. |
| 3c | `src/application/use-cases/submit-answer-exam.test.ts` | 6 | LEAVE cross-ref-key | User/session/question/choice submit fixtures. |
| 3c | `src/application/use-cases/submit-answer-retry.test.ts` | 28 | LEAVE cross-ref-key | Retry attempt/session/question/choice fixtures. |
| 3c | `src/application/use-cases/submit-answer-standalone.test.ts` | 13 | LEAVE cross-ref-key | Standalone submit user/question/choice/attempt fixtures. |
| 3c | `src/application/use-cases/submit-answer-tutor.test.ts` | 14 | LEAVE cross-ref-key | Tutor submit user/session/question/choice fixtures. |
| 3c | `src/application/use-cases/toggle-bookmark.test.ts` | 3 | LEAVE cross-ref-key | Bookmark user/question fixtures; `missing` sentinel stays only if explicitly absent-key behavior. |
| LEAVE | `src/application/test-helpers/fakes/fake-attempt-repository.test.ts` | 106 | Tier 3 LEAVE | Fake behavior-test semantic keys; PR 1 fixed generated defaults. |
| LEAVE | `src/application/test-helpers/fakes/fake-auth-gateway.test.ts` | 2 | Tier 3 LEAVE | Fake auth behavior tests; no real boundary. |
| LEAVE | `src/application/test-helpers/fakes/fake-idempotency-key-repository.test.ts` | 7 | Tier 3 LEAVE | Fake behavior keys; no adapter schema. |
| LEAVE | `src/application/test-helpers/fakes/fake-payment-gateway.test.ts` | 2 | Tier 3 LEAVE | Fake gateway behavior tests; no real Stripe/controller boundary. |
| LEAVE | `src/application/test-helpers/fakes/fake-practice-session-repository.test.ts` | 17 | Tier 3 LEAVE | Fake session behavior semantics; PR 1 fixed generated defaults. |
| LEAVE | `src/application/test-helpers/fakes/fake-subscription-repository.test.ts` | 6 | Tier 3 LEAVE | Fake subscription behavior keys; provider IDs remain provider-shaped. |
| LEAVE | `src/application/test-helpers/fakes/fake-tag-repository.test.ts` | 2 | Tier 3 LEAVE | Fake tag behavior keys/slugs; no boundary. |

#### PR 3b pre-execution audit: browser target list and hoisting rule

Re-audited on 2026-05-30 from `dev` at `895d03a5` after PR 3a merged. The canonical browser-spec grep is:

```sh
rg -n "\b(questionId|sessionId|attemptId|choiceId|selectedChoiceId|correctChoiceId|retryOfAttemptId|retrySessionId|userId|tagId|subscriptionId|idempotencyKey|question_id|session_id|attempt_id|choice_id|selected_choice_id|correct_choice_id|retry_of_attempt_id|retry_session_id|user_id|tag_id|subscription_id|idempotency_key|id)\s*[:=]\s*['\"](q|question|choice|session|attempt|user|db_user|tag|subscription|test|mock|fake|other|correct|incorrect|bookmark)[_-][A-Za-z0-9_-]+['\"]" \
  app/ components/ \
  --glob '*.browser.spec.tsx' \
  --glob '!**/_archive/**'
```

PR 3b audit result at `895d03a5`: **601 candidate lines across 40 browser spec files**. PR 3b shipped in PR #372 at `f39171f8`; the current browser-spec canonical count is **0 lines across 0 files**. The 3b rows in the table above remain the historical per-file execution target list.

Browser-only helper/probe files also contain shared boundary-ID fixtures consumed by the 3b specs. They are **in PR 3b scope even though the canonical `*.browser.spec.tsx` count excludes them**:

| Helper file | Candidate shape | Execution note |
|---|---|---|
| `app/(app)/app/questions/[slug]/use-question-page-controller-test-helpers.tsx` | Probe action calls `output.onSelectChoice('choice-1')`; test IDs/slugs are LEAVE. | Keep `data-testid` values and slug defaults readable. Replace only the choice ID value when execution introduces shared question-page choice ID constants/props, so button actions still match mocked choice DTO IDs. |
| `app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.fixtures.ts` | Shared `createQuestionResponse` / `createReviewResponse` defaults for `choice_1` and `session-1`. | Replace boundary defaults with named UUID values or require caller-supplied values where that preserves linkage more clearly. |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller-test-helpers.ts` | `CHOICE_1` / `CHOICE_2` / `CHOICE_3`, question navigation graph (`question-1` / `question-2` / `question-3`), and assertions referencing those IDs. | Use role-bearing constants once and reuse them in row fixtures, branching logic, and assertions. Do not blind-replace linked values independently. |
| `app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.probes.tsx` | Probe calls `usePracticeSessionPageController('session-1')`, `onSelectChoice('choice_1')`, `onNavigateQuestion('question-1')`, and `onOpenReviewQuestion('question-1')`; `data-testid` strings are LEAVE. | Import/reuse the same named ID constants as the shared browser helper fixtures so probe actions continue to target real DTO IDs. |

Browser file classification:

- **Controller-hook specs (Tier 1 FIX):** the `use-question-page-*`, `use-practice-session-page-controller-*`, `use-practice-session-question-flow*`, `use-practice-question-*`, `use-practice-session-start`, `use-practice-session-controls`, and `use-history-sessions` browser specs. These use `.claude/rules/testing-browser.md`'s controller-mocking pattern: `vi.mock(path, { spy: true })`, then `vi.mocked(controllerFn).mockResolvedValue(...)` or `mockImplementation(...)` in normal test scope. Mocked DTO/input IDs are FIX; test IDs, labels, slugs, and negative sentinels are LEAVE.
- **Component/render specs (Tier 1 FIX where props are controller-shaped):** `practice-view.browser.spec.tsx`, `practice-session-page-view-*.browser.spec.tsx`, `history-*-tab.browser.spec.tsx`, `QuestionCard.browser.spec.tsx`, `session-summary-view.browser.spec.tsx`, `exam-review-view.browser.spec.tsx`, `post-exam-review-view.browser.spec.tsx`, `incomplete-session-card.browser.spec.tsx`, `practice-session-starter.browser.spec.tsx`, and `practice-view-notification.browser.spec.tsx`. Props that model controller DTOs or app UUID columns are FIX; pure DOM/test tokens are LEAVE.
- **Browser specs with no canonical DEBT-400 target hits:** `theme-toggle.browser.spec.tsx`, `mobile-nav.browser.spec.tsx`, `notification-provider.browser.spec.tsx`, `ChoiceButton.browser.spec.tsx`, `bookmarks-toast.browser.spec.tsx`, `bookmark-row-shell.browser.spec.tsx`, `practice-session-toast.browser.spec.tsx`, `quick-practice-client.browser.spec.tsx`, and `use-exam-timer.browser.spec.tsx` are not migration targets unless execution discovers a concrete boundary-ID fixture while reading. Existing provider/navigation mock IDs remain out of scope.

Hoisting rule for PR 3b:

- `vi.hoisted()` is required only when a value is referenced inside a `vi.mock(path, () => ...)` factory body, because Vitest hoists the factory before ordinary module-scope constants initialize.
- `vi.hoisted()` is **not** required for UUID values passed to `vi.mocked(controllerFn).mockResolvedValue(...)`, `mockResolvedValueOnce(...)`, or `mockImplementation(...)` in `beforeEach` / `it` bodies after a `{ spy: true }` controller mock. Those values execute in normal scope.
- Current browser factory-mock exceptions are for external/mock-function setup, not UUID fixture constants: `next/navigation`, `next-themes`, and the practice-session page-controller browser setup hoist mock functions that feed factory mocks. No current browser UUID fixture constant feeds a `vi.mock(...)` factory body.
- PR 3b must therefore **not** consistency-hoist UUID constants across the slice. Add `vi.hoisted()` only if execution creates a UUID value that is directly read inside a `vi.mock(path, () => ...)` factory body; document that exception in the PR body if it happens.

PR 3b linkage/capture rule:

- Use named UUID variables for linked DTO graphs (`questionId`, choice IDs, `selectedChoiceId`, `correctChoiceId`, `attemptId`, `sessionId`) and reuse the same variable in mocked controller payloads, probe actions, and assertions.
- Capture and assert the generated ID where the test checks rendered text, calls, error messages, or route/navigation behavior.
- Do not change `data-testid`, button labels, slugs, provider IDs, or intentional invalid strings just because they resemble IDs.

PR 3b proof method:

- Scope proof: diff contains only `*.browser.spec.tsx`, the explicitly listed browser helper/probe/fixture files above when needed, and this DEBT doc. No PR 3a non-browser tests, no `src/application/**` PR 3c files, no adapters, no factories/fakes.
- Hoist proof: `git --no-pager diff origin/dev...HEAD | grep -E '^\+.*vi\.hoisted'` should be empty, unless a reviewed exception shows the new hoisted value is read inside a `vi.mock(path, () => ...)` factory body. Do not add `vi.hoisted()` for ordinary `mockResolvedValue` UUID constants.
- Type proof: no new `as any`, `as unknown as`, `@ts-ignore`, widened DTO types, or relaxed expectations.
- Linkage proof: call out at least one question/choice/session graph where named UUID variables preserve previous cross-reference semantics.
- Test proof: run touched browser specs directly where practical, then `pnpm test:browser`, `pnpm test --run tests/shared/fixture-uuid-integrity.test.ts`, `pnpm test --run components/theme-token-regression.test.tsx`, `pnpm test --run --sequence.shuffle`, and the full local gate.

PR 3b split decision: ship as **one browser PR** on `feat/debt-400-pr-3b-browser-fixtures`, with sub-area commits for reviewability (question-page controller hooks, practice-session controller hooks/helpers, component/render specs, history/misc). The slice is homogeneous and the hoisting rule above removes the main 3a review churn risk. Splitting further would add branch choreography without changing the boundary decision. If execution discovers the helper/probe changes are materially larger than the browser-spec edits, keep them in the same PR because they are shared browser fixture infrastructure for the same tests.

#### PR 3c value re-evaluation: application use-case/shared fixtures

Re-audited on 2026-05-30 from `dev` at `f39171f8` after PR 3b merged. This audit deliberately re-opened the value question instead of treating the old Tier 2 label as automatic execution scope.

Canonical application slice count:

```sh
rg -n "\b(questionId|sessionId|attemptId|choiceId|selectedChoiceId|correctChoiceId|retryOfAttemptId|retrySessionId|userId|tagId|subscriptionId|idempotencyKey|question_id|session_id|attempt_id|choice_id|selected_choice_id|correct_choice_id|retry_of_attempt_id|retry_session_id|user_id|tag_id|subscription_id|idempotency_key|id)\s*[:=]\s*['\"](q|question|choice|session|attempt|user|db_user|tag|subscription|test|mock|fake|other|correct|incorrect|bookmark)[_-][A-Za-z0-9_-]+['\"]" \
  src/application/ \
  --glob '*.test.ts' --glob '*.test.tsx' \
  --glob '!**/_archive/**'
```

Current result: **721 candidate lines across 34 files**:

- `src/application/use-cases/**` plus `src/application/shared/**`: **579 lines across 27 files**.
- `src/application/test-helpers/fakes/*.test.ts`: **142 lines across 7 files**.

Boundary determination:

- The application unit-test slice is fake-backed. `src/application/**/*.test.ts` currently has no imports of `@/src/adapters`, `db/schema`, Drizzle, Postgres, `zUuid`, or adapter controller schemas. A grep for those boundary imports only finds a comment in `get-previous-attempt.test.ts` saying a fake sort order matches the Drizzle implementation.
- `src/application/use-cases/**` and `src/application/shared/**` production code likewise has no adapter/db/schema validation dependency. This is the intended Clean Architecture direction: application logic depends on ports and domain types; adapter validation lives outside it.
- The real UUID-column/controller boundary is covered by `tests/integration/**` and adapter tests. Spot checks of `tests/integration/session-attempt-repository.integration.test.ts`, `tests/integration/controllers.integration.test.ts`, and `tests/integration/helpers.ts` show real DB/controller paths create app IDs through database defaults / returned rows and `randomUUID()`-driven helper data. The canonical placeholder grep returns **0** matches in `tests/integration/**`.
- PR 1 already proves factory/fake-generated defaults with `tests/shared/fixture-uuid-integrity.test.ts`, which calls the real `zUuid.safeParse()` helper.

Honest re-tier:

| Bucket | Count | Files | Decision |
|---|---:|---:|---|
| GENUINE-FIX | 0 | 0 | No application unit-test fixture currently crosses a real validator, adapter repository, or DB column at test time. |
| LEAVE cross-ref-key | 579 | 27 | Use-case/shared tests use readable linked keys behind fakes (`q1` / `questionId: 'q1'`, `c1` / `selectedChoiceId: 'c1'`, `session-1`, `attempt-parent`). Leave them unchanged. |
| LEAVE Tier-3 fake behavior tests | 142 | 7 | Re-confirmed. These test fake-specific behavior with semantic keys; PR 1 fixed generated fake defaults. |
| LEAVE provider/external IDs | 143 | 9 | Separate provider grep finds Stripe/Clerk/Svix-shaped IDs in `create-checkout-session.test.ts`, `create-portal-session.test.ts`, and fake provider repository tests. They are not app UUIDs. |

Scope recommendation: **SKIP PR 3c as an execution PR.**

Rationale:

- Fix value would be production-shape consistency and future-refactor defense, not active boundary protection.
- The churn cost is high: the largest files are dense cross-reference graphs (`get-previous-attempt.test.ts` 110 canonical hits, `get-attempted-questions.test.ts` 76, `save-exam-draft-answer.test.ts` 59). Replacing those with UUID variables would make behavior tests harder to read and review.
- The same reasoning that left `src/application/test-helpers/fakes/*.test.ts` applies here: these are inner-layer behavior tests behind fakes. They do not exercise adapter validation.
- The no-speculative-debt bar does not support UUID-ifying hundreds of readable fake-backed keys for "could matter someday." Future real-boundary migrations should add targeted tests or change the specific fixtures that cross that new boundary.

If a future genuine boundary-crossing application test appears, the recipe remains:

- Introduce named UUID variables once and preserve entity-graph linkage (`const questionId = crypto.randomUUID(); const choiceId = crypto.randomUUID();` reused across question, choice, attempt, session, and assertions).
- Capture generated IDs in assertions and error-message checks.
- Do not add `as any`, `as unknown as`, `@ts-ignore`, widened DTO types, or fixture `vi.hoisted()`.
- Do not churn provider IDs, slugs, component/enum tokens, or negative invalid fixtures.

Durable guardrail:

- PR 4 ships the important remaining DEBT-400 guardrail: `.claude/rules/fixture-integrity.md` as SSOT, a short `testing.md` pointer, `CLAUDE.md` path-scoped row, and the schema-validation-major step in `docs/dev/dependency-update-protocol.md`.
- The rule must explicitly teach that fake-backed inner-layer semantic keys may stay readable unless they cross a real boundary, and it must include the hoisting discipline learned in PR 3b: `vi.hoisted()` only when a value is read inside a `vi.mock(path, () => ...)` factory body.
- PR 1's proof harness plus adapter/integration suites are the durable protection for the actual boundary. The campaign value is in those guards and the rule, not in churning every fake-backed fixture.

#### PR 3 split plan

PR 3 must not ship as one mega-PR. The code sweep shipped as PR 3a and PR 3b; PR 3c was value re-evaluated and intentionally skipped:

1. **PR 3a - app/component non-browser fixtures + E2E helper unit tests**
   - Branch: `feat/debt-400-pr-3a-app-component-fixtures`
   - Scope: the rows labeled `3a` above.
   - Proof: run the touched files directly, `pnpm test --run app/ components/ tests/e2e/helpers`, PR 1 harness, DEBT-398 scan, shuffled unit suite, full local gate.
   - Status: shipped in PR #371 at `895d03a5`; PR 3b, PR 4, DEBT-402, and archive follow.
2. **PR 3b - browser fixture sweep**
   - Branch: `feat/debt-400-pr-3b-browser-fixtures`
   - Scope: the rows labeled `3b` above plus the browser-only helper/probe/fixture files enumerated in the PR 3b pre-execution audit subsection when they define shared boundary IDs.
   - Proof: run touched browser specs directly and `pnpm test:browser`, plus PR 1 harness, DEBT-398 scan, shuffled unit suite, full local gate, and the no-unnecessary-`vi.hoisted()` proof.
   - Status: shipped in PR #372 at `f39171f8`; docs updated here. PR 4, DEBT-402, and archive follow.
3. **PR 3c - application use-case/shared fixtures**
   - Branch: `feat/debt-400-pr-3c-application-fixtures`
   - Scope: audit-only value re-evaluation.
   - Status: **skipped as an execution PR**. Current application unit tests are fake-backed inner-layer behavior tests with no real adapter/schema/DB validation at test time. Remaining 579 use-case/shared hits and 142 fake-test hits are documented LEAVE classes.
   - Proof: no code changes. PR 4 rule docs plus PR 1 harness and integration/adapter tests provide the durable boundary protection.

Tier 3 fake-test files and PR 3c use-case/shared files are intentionally not assigned an execution PR. PR 4 remains the fixture-integrity docs SSOT. After PR 4 merges, archive DEBT-400 in a separate doc-only archive PR.

PR 3 proof method:

- Prefer TypeScript's existing DTO/output types (`satisfies`, imported output types, factory return types) instead of exporting private controller schemas.
- Generated IDs must be semantic variables, not opaque inline UUID literals.
- Preserve relationships by capture/reuse: a row `questionId`, the corresponding `createQuestion({ id })`, selected choice, correct choice, and assertion must use the same variable.
- Do not add `as any`, `as unknown as`, `@ts-ignore`, widened DTO types, or relaxed expectations to make a fixture fit.
- Provider IDs and negative fixtures remain intentionally non-UUID.
- The canonical grep may still return harmless/external/provider hits. Acceptance is that every remaining hit is either harmless by the boundary definition, Tier 3 fake-test semantics, provider-shaped, component-only, or intentionally invalid and documented by naming/context.

### PR 4 — Fixture-integrity rule docs (SSOT)

Branch: `feat/debt-400-pr-4-fixture-integrity-docs`

Canonical structure: **Option A**.

- Create `.claude/rules/fixture-integrity.md` as the single source of truth. Confirmed absent during the PR 4 pre-execution audit.
- Add only a short pointer section to `.claude/rules/testing.md` immediately after "Test Environment Isolation"; do not duplicate the full rule body.
- Add the new rule file to the `CLAUDE.md` Path-Scoped Rules table near `test-isolation.md`.
- Update `docs/dev/dependency-update-protocol.md` with a Schema-Validation Majors fixture-audit step citing PR #330. Insert this as its own section after "Dev-Tooling Majors" and before "Red CI on Dependabot PRs"; it parallels the existing jsdom PR #328 precedent.
- Finalize this DEBT-400 doc with PR 4 complete status, the PR 3c skip rationale carried forward from `d97df8c7`, and the remaining follow-up sequence: DEBT-402, then a separate DEBT-400 archive PR.

Status: implemented by the PR 4 execution branch. This completes the DEBT-400 code/rule campaign when merged; DEBT-402 and the archive PR remain separate follow-ups.

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

The first five paths mirror the `test-isolation.md` convention; the two helper-directory paths are deliberate DEBT-400 additions so factory/fake default-ID edits also load the fixture-integrity rule.

Rule content contract:

The rule body must be tight, but it must encode these four lessons explicitly:

1. **Boundary.** Application-owned production IDs are UUID-shaped at the real boundary: controller schemas use `zUuid = z.guid()` in `src/adapters/shared/zod-schemas.ts`, and application-owned database identifiers are Drizzle `uuid()` columns in `db/schema.ts`. Fixtures that cross those boundaries must match the production shape.
2. **FIX vs LEAVE.** FIX controller input/output DTO mocks, controller valid-path inputs, adapter repository row fixtures, mocked SQL rows, mapper rows, app-auth `userId` fixtures, E2E-helper app DB-row mocks, and shared factory/fake-generated defaults when they model `zUuid` fields or Drizzle `uuid()` columns. LEAVE provider IDs (`cus_`, `sub_`, `evt_`, `price_`, Clerk/Svix IDs), slugs, labels, HTML ids, `data-testid`, React-only keys, and intentionally invalid negative-validation fixtures. LEAVE fake-backed application use-case/shared tests and fake-repository behavior tests when their IDs are readable semantic cross-reference keys behind fakes; PR 3c proved those unit tests do not hit real adapter/schema/DB validation, the real boundary is covered by adapter/integration tests, and UUID-ifying those graphs would reduce readability for production-shape consistency alone.
3. **Hoisting discipline.** Use `vi.hoisted()` for fixture values only when the value is read inside a `vi.mock(path, () => ...)` factory body. The browser `{ spy: true }` plus `vi.mocked(controllerFn).mockResolvedValue(...)` / `mockImplementation(...)` pattern runs in normal scope and does not need fixture hoisting. Do not consistency-hoist UUID variables.
4. **Mechanics and proof.** Prefer UUID-emitting factories where available, otherwise use named role-bearing `crypto.randomUUID()` variables. Preserve cross-reference linkage by reusing the same variable for related entities, and capture generated IDs in assertions and error strings. Do not introduce `as any`, `as unknown as`, `@ts-ignore`, widened DTO types, or relaxed expectations to make a fixture fit; DEBT-402 tracks the separate mocked-DTO type-drift class. Cite `tests/shared/fixture-uuid-integrity.test.ts` as the PR 1 proof harness for generated factory/fake defaults.

The rule must also say that schema-validation major upgrades require a fixture audit before merge, citing PR #330, and that harmless existing sites must not be churned for style consistency alone.

`testing.md` pointer shape:

```markdown
## Fixture Integrity

Tests and test helpers that create boundary-shaped fixtures MUST keep application-owned IDs valid at controller/DB boundaries and MUST leave provider IDs, fake-backed semantic keys, UI tokens, and intentional-invalid fixtures alone. See **`.claude/rules/fixture-integrity.md`** for the full FIX/LEAVE rule, UUID-linkage mechanics, and `vi.hoisted()` guidance.
```

`CLAUDE.md` table row shape:

```markdown
| `fixture-integrity.md` | `**/*.test.ts(x)`, `**/*.spec.ts(x)`, `tests/**`, `src/**/test-helpers/**` | UUID fixture boundary discipline, FIX/LEAVE tiers, linkage, hoisting |
```

`dependency-update-protocol.md` insertion content:

```markdown
## Schema-Validation Majors

Major updates to Zod or another validation/schema library must include a boundary-fixture audit before merge. PR #330 is the local precedent: Zod 4 changed UUID/GUID validation semantics, so app-owned ID fixtures had to be checked against `zUuid = z.guid()` and Drizzle `uuid()` columns.

Audit controller schemas, repository row fixtures, mocked controller DTOs, shared factories/fakes, and integration fixtures for shape drift. Keep provider IDs and intentional-invalid negative tests provider-shaped/invalid; fix only fixtures that cross the real validation or database boundary.
```

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

- PR 3a and PR 3b have shipped in that order, with only their assigned rows from the PR 3 table touched.
- PR 3c has been value re-evaluated and intentionally skipped as a code PR because the application use-case/shared tests are fake-backed inner-layer behavior tests with no real adapter/schema/DB validation at unit-test time.
- App/browser tests no longer use placeholder IDs for mocked controller DTOs or E2E helper app DB row mocks that cross the boundary definition.
- Application use-case/shared and Tier 3 fake-test remaining hits are documented LEAVE classes unless a future test crosses a real adapter/schema boundary.
- Tier 3 fake-test files are either unchanged or have only directly necessary fallout edits, with semantic fake-behavior keys preserved.
- Remaining canonical-grep hits are harmless/provider IDs, pure UI tokens, slugs, Tier 3 fake-test semantic keys, or intentionally invalid validation fixtures.
- No new `as any`, `as unknown as`, `@ts-ignore`, widened DTO types, or relaxed expectations are introduced.
- `tests/shared/fixture-uuid-integrity.test.ts` from PR 1 remains green.
- `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16.
- `pnpm test --run --sequence.shuffle` stays green after the sweep.
- Full local gate green.

PR 4 done when:

- `.claude/rules/fixture-integrity.md` exists with the SSOT rule.
- `.claude/rules/testing.md` has only a pointer to the rule, not a duplicated body.
- `CLAUDE.md` lists the new path-scoped rule.
- `docs/dev/dependency-update-protocol.md` records the schema-validation-major fixture-audit step.
- The rule captures the PR 3c value decision: fake-backed application behavior-test keys are LEAVE unless they cross a real boundary, and `vi.hoisted()` is not a blanket fixture-consistency tool.
- `tests/shared/fixture-uuid-integrity.test.ts` remains green.
- `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16.
- Full local gate green.

Cross-PR sanity:

- `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16.
- No DEBT-398 design-system scan surfaces are modified.
- After PR 4 merges, archive DEBT-400 in a separate doc-only archive PR.

---

## Risk and Reversibility

- **PR 1:** medium risk because factories/fakes are widely reused and some tests intentionally relied on deterministic `attempt-1` / `session-1` sequences. Failures should be loud and local: capture returned IDs instead of asserting generated literals.
- **PR 2:** medium risk in adapter tests because repository fixtures often mirror SQL rows. Keep changes mechanical and boundary-scoped.
- **PR 3a/3b:** medium risk because app/browser fixture graphs are broad and many assertions depend on linked IDs. Split by the locked sub-PR plan above, use capture-the-id variables, and rerun affected tests frequently.
- **PR 3c:** audit-only after value re-evaluation; no code risk because fake-backed application unit-test keys are intentionally left readable.
- **PR 4:** doc-only; low risk.

All PRs are independently revertible.

---

## Done When

All DEBT-400 execution PRs (PR 1, PR 2a, PR 2b, PR 3a, PR 3b, and PR 4) merge to `dev` and sync to `main`; PR 3c is recorded as an audit-only skip; the dedicated fixture-integrity rule is live; `testing.md` points to it without duplicating the body; factories/fakes emit UUID-valid defaults; boundary-crossing fixtures use UUID-valid values; remaining placeholder-ID grep hits are documented harmless classes; full local gate is green; DEBT-400 is archived with a resolution paragraph naming the PRs and the PR 3c skip decision.
