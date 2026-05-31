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

# Fixture Integrity Rules

## Boundary-shaped fixtures

Test fixtures must match production validators when they cross a real boundary.

Application-owned IDs are UUID-shaped at the boundary:

- controller schemas use `zUuid = z.guid()` in `src/adapters/shared/zod-schemas.ts`
- application-owned database identifiers use Drizzle `uuid()` columns in `db/schema.ts`

Use UUID-valid values for fixtures that model controller input/output DTOs, adapter repository rows, mocked SQL rows, mapper rows, app-auth `userId` values, E2E-helper app DB rows, and shared factory/fake-generated defaults for those fields.

Prefer UUID-emitting factories where available. Otherwise use named, role-bearing variables:

```typescript
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();
```

## FIX vs LEAVE

FIX values that cross `zUuid` or Drizzle `uuid()` boundaries.

LEAVE values that are not application-owned UUID fixtures:

- provider IDs such as `cus_`, `sub_`, `evt_`, `price_`, Clerk, and Svix IDs
- slugs, labels, HTML ids, `data-testid`, and React-only keys
- intentionally invalid negative-validation fixtures
- readable fake-backed application use-case/shared test keys, unless that specific fixture now crosses a real adapter/schema/DB boundary
- fake-repository behavior-test keys in `fake-*-repository.test.ts`

The PR 3c value decision is deliberate: current application use-case/shared unit tests run behind fakes and do not hit real adapter/schema/DB validation. The real boundary is covered by adapter and integration tests. UUID-ifying dense semantic graphs like `q1` / `questionId: 'q1'` would reduce readability for production-shape consistency alone.

## Linkage mechanics

Preserve entity relationships by reusing the same named UUID variable everywhere the same entity is referenced.

```typescript
const questionId = crypto.randomUUID();
const correctChoiceId = crypto.randomUUID();

const question = createQuestion({ id: questionId });
const choice = createChoice({ id: correctChoiceId, questionId });
const attempt = createAttempt({
  questionId,
  outcome: answeredOutcome(correctChoiceId),
});
```

Capture generated IDs in assertions and error strings. Do not assert old deterministic placeholders after switching a factory or fake to generated IDs.

## Type discipline

Do not add `as any`, `as unknown as`, `@ts-ignore`, widened DTO types, or relaxed expectations to make a fixture fit.

Use a production-shaped fixture instead. DEBT-402 tracks the separate mocked-DTO type-drift class where tests cast impossible output shapes.

## Hoisting discipline

Use `vi.hoisted()` for fixture values only when the value is read inside a `vi.mock(path, () => ...)` factory body.

Do not use `vi.hoisted()` for UUID values passed to `vi.mocked(controllerFn).mockResolvedValue(...)`, `mockResolvedValueOnce(...)`, or `mockImplementation(...)` in normal `beforeEach` / `it` scope after a `{ spy: true }` controller mock. Do not consistency-hoist fixtures.

## Dependency majors

Major updates to Zod or another validation/schema library must include a boundary-fixture audit before merge. PR #330 is the local precedent: Zod 4 changed UUID/GUID validation semantics, so app-owned ID fixtures had to be checked against `zUuid = z.guid()` and Drizzle `uuid()` columns.

## Proof harness

`tests/shared/fixture-uuid-integrity.test.ts` is the focused proof that generated factory/fake defaults pass the real `zUuid.safeParse()` contract. Keep it green when changing shared factories or fakes.

Do not churn harmless existing sites for style consistency alone.
