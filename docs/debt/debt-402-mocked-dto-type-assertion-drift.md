# DEBT-402: Mocked DTO Type Assertion Drift

**Priority:** P3 (test-only type-safety debt. The current concrete surface is small, but it bypasses the exact DTO type checks that should make mocked controller/use-case outputs stay production-shaped.)
**Created:** 2026-05-29
**Source:** DEBT-400 PR 3 pre-execution audit from `dev` at `3b225505`. The audit's related-class sweep found mocked DTO fixtures that use `as unknown as ...Output` to force impossible shapes through TypeScript instead of constructing valid typed fixtures.
**Related:** [DEBT-400](./debt-400-test-fixture-integrity-zod-boundary.md), [src/adapters/controllers/practice-controller.ts](../../src/adapters/controllers/practice-controller.ts), [src/adapters/controllers/tag-controller.ts](../../src/adapters/controllers/tag-controller.ts)

**Status:** Active

---

## Problem

Mocked controller/use-case DTO fixtures should be constrained by the same exported output types production consumers receive. A test that writes:

```typescript
const output = { ok: true } as unknown as GetPracticeSessionReviewOutput;
```

does not prove the test fixture matches the controller boundary. It only suppresses TypeScript. If the DTO changes, or if a component later reads a field that the fake omitted, the test can keep passing with a fixture shape that production can never return.

This is separate from DEBT-400's UUID-value class. DEBT-400 fixes invalid identifier **values** in otherwise intentional fixtures; DEBT-402 fixes mocked DTO fixtures that bypass the DTO **shape** contract.

---

## Findings

Concrete current sites:

| File | Line | Cast | Why it is real debt |
|---|---:|---|---|
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 937 | `{ ok: true } as unknown as GetPracticeSessionReviewOutput` | The object is not a review output. The test only needs a sentinel object to verify state transition, but the cast hides that the DTO shape is impossible. |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 1072 | `{ ok: true } as unknown as GetPracticeSessionReviewOutput` | Same impossible-shape pattern for summary-review loading. |
| `app/(app)/app/history/page.test.tsx` | 324 | object literal `as unknown as GetTagsOutput` | The fixture includes `kind: 'domain'`, which is not part of the tag-kind boundary (`topic`, `substance`, `treatment`, `diagnosis`). The test is trying to verify unsupported kinds are filtered, but the unsafe cast hides the invalid DTO from TypeScript. |

Current sweep:

```sh
rg -n "as unknown as .*Output|as any.*Output|@ts-(ignore|expect)" \
  app/ src/application/ components/ tests/e2e/helpers \
  --glob '*.test.ts' --glob '*.test.tsx' --glob '*.spec.ts' --glob '*.spec.tsx'
```

The output contains the three sites above plus intentional negative type tests (`@ts-expect-error`) and non-DTO platform seams. Only these three are mocked DTO shape drift.

---

## Required Remediation

Ship one small test-only PR after DEBT-400 PR 3, or fold into the affected DEBT-400 sub-PR only if it is already touching the same file and the diff remains obvious.

Fix shape:

1. Replace impossible DTO casts with valid minimal fixture builders.
2. Prefer `satisfies OutputType` or an explicit return type on the builder so TypeScript checks the DTO shape.
3. If a test needs a sentinel for state-transition identity and does not care about DTO fields, use a real minimal DTO with semantic values, not `{ ok: true }`.
4. For the unsupported tag-kind filtering test, do not cast invalid data to `GetTagsOutput`. Either:
   - model the unsupported row before the controller boundary and test that mapper/filter directly, or
   - keep the page-level test on valid `GetTagsOutput` rows and move the invalid-kind coverage to the layer that actually accepts untrusted input.

Do not add broader runtime validation to tests only to compensate for unsafe casts. The clean fix is to make fixtures satisfy the exported DTO contracts.

---

## Acceptance Criteria

- No `as unknown as ...Output` or `as any ...Output` remains in app/application/component/e2e-helper tests.
- Existing intentional `@ts-expect-error` type-contract tests remain if they are proving compile-time rejection and include a clear rationale.
- The affected test files pass directly.
- Full local gate green.
- No production code changes unless a test exposes a real production mapper bug.
