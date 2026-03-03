# DEBT-270: Integration Test God File Split

**Status:** Active
**Priority:** P3
**Date:** 2026-03-03
**Owner:** Testing
**Related:** DEBT-271, DEBT-272

---

## Description

`tests/integration/repositories.integration.test.ts` is 2,686 lines with 13 top-level `describe` blocks covering 10+ unrelated repository classes, 3 bug-regression suites, and a use-case integration test. This is a classic god file — navigating to a specific test requires scrolling past thousands of lines of unrelated code, and a failure banner like "repositories.integration.test.ts > DrizzleBookmarkRepository" gives no immediate locality signal.

The project already demonstrates the correct pattern: `controllers.integration.test.ts` (818 lines), `actions.stripe.integration.test.ts` (242 lines), `tag-taxonomy-census.integration.test.ts` (106 lines) — each scoped to a single domain concern.

## Why this is debt (not a one-line fix)

The split is mechanical but requires care:
1. Shared setup (`db`, `postgres`, cleanup helpers) must be extracted or imported consistently.
2. Each new file needs its own `afterEach` cleanup tracking with the correct tables.
3. Test execution order may interact with DB state if parallelism is enabled (currently sequential).
4. Helper functions like `createUser()`, `createQuestion()`, `createTag()` defined inline in the file need to either move to `setup.ts` or be duplicated.

## Current structure (13 describe blocks)

| Describe Block | Lines | Concern |
|---------------|-------|---------|
| `DrizzleQuestionRepository` | 210–680 | Question repo CRUD + filters |
| `listPublishedCandidateIds with status filters` | 341–680 | (nested inside above) |
| `countPublishedCandidateIds with status filters` | 682–796 | (nested inside above) |
| `DrizzlePracticeSessionRepository + DrizzleAttemptRepository` | 798–1736 | Session + attempt lifecycle |
| `DrizzleBookmarkRepository` | 1737–1763 | Bookmark CRUD |
| `Stripe repositories` | 1764–1950 | Stripe customer/event repos |
| `DrizzleUserRepository` | 1951–2100 | User repo CRUD |
| `DrizzleIdempotencyKeyRepository` | 2101–2213 | Idempotency key lifecycle |
| `DrizzleRateLimiter` | 2214–2240 | Rate limiter |
| `DrizzleTagRepository` | 2241–2284 | Tag repo |
| `BUG-186` | 2285–2395 | Exam secrecy regression |
| `BUG-187` | 2396–2554 | Dashboard counts regression |
| `BUG-188` | 2555–2686 | Legacy CAS regression |

## Proposed split

| New File | Source Blocks | ~Lines |
|----------|-------------|--------|
| `question-repository.integration.test.ts` | DrizzleQuestionRepository (all nested) | ~590 |
| `session-attempt-repository.integration.test.ts` | DrizzlePracticeSessionRepository + DrizzleAttemptRepository | ~940 |
| `bookmark-repository.integration.test.ts` | DrizzleBookmarkRepository | ~30 |
| `stripe-repositories.integration.test.ts` | Stripe repositories | ~190 |
| `user-repository.integration.test.ts` | DrizzleUserRepository | ~150 |
| `idempotency-key-repository.integration.test.ts` | DrizzleIdempotencyKeyRepository | ~115 |
| `rate-limiter.integration.test.ts` | DrizzleRateLimiter | ~30 |
| `tag-repository.integration.test.ts` | DrizzleTagRepository | ~45 |
| `bug-regression.integration.test.ts` | BUG-186, BUG-187, BUG-188 | ~400 |

### Shared setup extraction

Inline helpers that need to move to `setup.ts` (or a new `helpers.ts`):
- `createUser(overrides?)` — inserts a user row, returns it, tracks for cleanup
- `createQuestion(overrides?)` — inserts a question row with choices
- `createTag(overrides?)` — inserts a tag row
- Cleanup tracking arrays and `afterEach` teardown

## Acceptance criteria

- [ ] Each new file is self-contained (imports setup, runs independently)
- [ ] Shared helpers extracted to `tests/integration/helpers.ts`
- [ ] All 57 existing tests still pass with identical behavior
- [ ] No test depends on execution order or state from another file
- [ ] Original `repositories.integration.test.ts` deleted (not left as empty shell)
- [ ] `pnpm test:integration` passes with no regressions

## Effort estimate

Mechanical refactor: ~2-3 hours.

## Risk

Low. Pure file reorganization with no behavioral changes. The only risk is accidentally breaking a test that depends on setup from a different `describe` block — mitigated by running the full integration suite after each extraction.
