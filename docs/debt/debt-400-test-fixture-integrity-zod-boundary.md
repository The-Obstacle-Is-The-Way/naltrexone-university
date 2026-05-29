# DEBT-400: Test Fixture Integrity (Zod Boundary Class)

**Priority:** P2 (latent bug class. The current canonical candidate grep finds 2,447 placeholder-ID assignments across 163 test files. This is a candidate set, not a mandate to replace every string: the execution scope is only IDs that cross `zUuid = z.guid()` controller schemas or model Drizzle `uuid()` columns.)
**Created:** 2026-05-26
**Source:** Deep schema/boundary integrity audit conducted alongside DEBT-394 archival; re-audited on 2026-05-28 from `dev` at `f2dc0793`. Direct precedent is PR #330, which bumped Zod from 3 to 4 and deliberately kept historical UUID/GUID behavior by replacing the shared controller ID schema with Zod 4 `z.guid()`.
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

Current result on `f2dc0793`: **2,447 lines across 163 files**.

This replaces the old narrower `604 / 64` count. The old grep only searched `app/ src/ components/`, only camel-case object properties, only five field names, and only underscore-prefixed values. It missed hyphenated placeholders (`session-1`), choice/tag/subscription fields, snake_case SQL-row fixtures (`user_id`), and `tests/**` helper fixtures.

High-count files from the current sweep:

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

The broad candidate set is now 2,447 lines across 163 files. Many are real boundary-crossing problems, but some are intentionally harmless:

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

### C. Domain factories and fakes still generate non-UUID IDs

Confirmed current drift:

- `src/domain/test-helpers/factories.ts:28` returns `id: 'user-1'`.
- `src/domain/test-helpers/factories.ts:49-55` defaults attempt `id`, `userId`, `questionId`, and selected choice values to non-UUID strings.
- `src/domain/test-helpers/factories.ts:73-74` defaults bookmark `userId` / `questionId` to non-UUID strings.
- `src/domain/test-helpers/factories.ts:82`, `92-93`, `106`, `131-132`, `161`, and `187-188` default tag, choice, question, subscription, and practice-session IDs to non-UUID strings.
- `src/application/test-helpers/fakes/fake-attempt-repository.ts:29, 40-44, 82-83` tracks numeric `nextId` and emits `attempt-${n}`.
- `src/application/test-helpers/fakes/fake-practice-session-repository.ts:192` emits `session-${this.sessions.length + 1}`.
- `src/application/test-helpers/fakes/fake-user-repository.ts:13, 98` tracks numeric `nextId` and emits `user-${n}`.
- `src/application/test-helpers/fakes/fake-subscription-repository.ts:63` emits `subscription-${this.byUserId.size + 1}`.

These are high-leverage fixes because many tests receive IDs indirectly from the shared factory/fake layer.

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

Ship as split, reviewable PRs. The original four-PR plan is replaced because a 2,447-hit candidate set is too large for one "fixture sweep" PR, and duplicating rule text across `testing.md` and a new rule file would recreate the DEBT-395 documentation drift trap.

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

### PR 2 — Adapter boundary fixture sweep

Branch: `feat/debt-400-pr-2-adapter-boundary-fixtures`

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

- Valid-path adapter/controller tests use UUID-valid values for every `zUuid` field.
- Adapter repository row fixtures use UUID-valid values for every Drizzle `uuid()` column they model.
- Invalid UUID negative tests remain explicit and intentional.
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
