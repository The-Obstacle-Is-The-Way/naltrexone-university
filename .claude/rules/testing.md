# Testing Rules

## Framework: Vitest (NOT Jest)

Use **Vitest** exclusively. Do NOT use Jest APIs or `jest.mock()`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

## TDD Mandate

ALL code MUST be test-driven. No exceptions.

1. Write the test first (Red)
2. Write minimum code to pass (Green)
3. Refactor if needed (Refactor)

## Fakes Over Mocks

Use existing fakes from `src/application/test-helpers/fakes/`. NEVER use `vi.mock()` for our own code.

**Available fakes source of truth:** `src/application/test-helpers/fakes/index.ts`. Common examples include `FakeQuestionRepository`, `FakeAttemptRepository`, `FakePracticeSessionRepository`, `FakeQuestionFeedbackRepository`, `FakeSubscriptionRepository`, `FakeUserRepository`, `FakeBookmarkRepository`, `FakeTagRepository`, `FakeStripeCustomerRepository`, `FakeStripeEventRepository`, `FakeIdempotencyKeyRepository`, `FakeClerkEventRepository`, `FakeDeletedClerkUserRepository`, `FakePendingStripeCancellationRepository`, `FakeLogger`, `FakeAuthGateway`, `FakePaymentGateway`, and `FakeRateLimiter`. Use-case fakes also exist — check the barrel before adding or listing a fake.

**Decision tree:**
- Fake exists? Use it.
- External dependency (Drizzle, Clerk, Stripe SDK)? Use `vi.fn()` inline or `vi.mock()`.
- No fake exists for our code? Create one in `fakes/`, then use it.

**`vi.mock()` is ONLY acceptable for:**
- External SDKs: `@clerk/nextjs`, `next/link`, `server-only`
- Browser Mode sealed ESM: `vi.mock(path, { spy: true })` for controller modules

## Test Environment Isolation

Tests that mutate `process.env` (module-scope defaults, `vi.stubEnv()`, or direct assignment) MUST snapshot/restore via `tests/shared/process-env.ts`. See **`.claude/rules/test-isolation.md`** for the full rule, cleanup ordering, and examples.

## Fixture Integrity

Tests and test helpers that create boundary-shaped fixtures MUST keep application-owned IDs valid at controller/DB boundaries and MUST leave provider IDs, fake-backed semantic keys, UI tokens, and intentional-invalid fixtures alone. See **`.claude/rules/fixture-integrity.md`** for the full FIX/LEAVE rule, UUID-linkage mechanics, and `vi.hoisted()` guidance.

## Test Quality

1. Test behavior, not implementation
2. One concept per `it()`
3. Arrange-Act-Assert pattern
4. Use factories: `createQuestion()`, `createChoice()` from `src/domain/test-helpers/`
5. Descriptive names: `it('returns isCorrect=false when incorrect choice selected')`
6. Prefer semantic assertions over exact utility-class strings

### Styling Assertions

- Prefer stable markers (`role`, visible text, `href`, `data-testid`) for UI tests.
- Exact Tailwind class-string assertions are allowed only when the class itself encodes behavior (e.g. `sr-only`, breakpoint visibility, focus-ring presence, active-state tokens).
- Avoid asserting full space-delimited class strings for purely presentational styles.

## Test Locations

| Type | Pattern | Command |
|------|---------|---------|
| Unit (logic) | `*.test.ts` colocated | `pnpm test` |
| Component (render) | `*.test.tsx` colocated | `pnpm test` |
| Hook (async/interactive) | `*.browser.spec.tsx` colocated | `pnpm test:browser` |
| Integration | `tests/integration/*.integration.test.ts` | `pnpm test:integration` |
| E2E | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |
