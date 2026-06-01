# DEBT-402: Mocked DTO Type Assertion Drift

**Priority:** P3 (test-only type-safety debt. The current concrete surface is small, but it bypasses the exact DTO type checks that should make mocked controller/use-case outputs stay production-shaped.)
**Created:** 2026-05-29
**Source:** DEBT-400 PR 3 pre-execution audit from `dev` at `3b225505`. The audit's related-class sweep found mocked DTO fixtures that use `as unknown as ...Output` to force impossible shapes through TypeScript instead of constructing valid typed fixtures.
**Related:** [DEBT-400](../_archive/debt/debt-400-test-fixture-integrity-zod-boundary.md), [.claude/rules/fixture-integrity.md](../../.claude/rules/fixture-integrity.md), [src/adapters/controllers/practice-controller.ts](../../src/adapters/controllers/practice-controller.ts), [src/adapters/controllers/tag-controller.ts](../../src/adapters/controllers/tag-controller.ts)

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

Pre-execution audit from `dev` at `c0cca8bb` re-ran the narrow mocked-DTO sweep:

```sh
rg -n "as unknown as [A-Za-z]+(Output|Dto|DTO|Result|Response)" \
  app src components \
  -g '*.test.ts' -g '*.test.tsx' -g '*.browser.spec.tsx'
```

Current surface is **4 sites / 3 files**:

| File | Line | Cast | Classification | Why it is real debt |
|---|---:|---|---|---|
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 974 | `{ ok: true } as unknown as GetPracticeSessionReviewOutput` | LAZY-SENTINEL | The test only needs identity/state-transition proof, but `{ ok: true }` is not a review output. The cast hides an impossible controller DTO shape. |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` | 1109 | `{ ok: true } as unknown as GetPracticeSessionReviewOutput` | LAZY-SENTINEL | Same impossible-shape sentinel for summary-review loading. |
| `app/(app)/app/history/page.test.tsx` | 363 | object literal `as unknown as GetTagsOutput` with `kind: 'domain'` | INTENTIONAL-INVALID | `domain` is deliberately out of contract. `GetTagsOutput` only allows `topic`, `substance`, `treatment`, and `diagnosis`; the page-level mocked controller DTO should not pretend production can return `domain`. |
| `src/adapters/controllers/practice-controller-session-lifecycle.test.ts` | 504 | object literal `as unknown as FinalizeExamAnswersOutput` with `questionCount: -1` | INTENTIONAL-INVALID | This is a negative output-validation test. The value is invalid for `FinalizeExamAnswersOutputSchema`, but it is still structurally compatible with the exported TypeScript output type because `questionCount` is `number`. The whole-DTO cast is unnecessary and weakens the test. |

Exported output types are importable at the affected sites:

- `GetPracticeSessionReviewOutput` is exported from `src/adapters/controllers/practice-controller.ts` and already imported in `practice-session-page-logic.test.ts`.
- `GetTagsOutput` is exported from `src/adapters/controllers/tag-controller.ts` and already imported in `history/page.test.tsx`.
- `FinalizeExamAnswersOutput` is exported from `src/application/use-cases/index.ts` and already imported in `practice-controller-session-lifecycle.test.ts`.

---

## Required Remediation

Ship one small test-only PR on `feat/debt-402-mocked-dto-type-drift`. Do not expand beyond these 4 sites.

Per-site recipe:

1. `practice-session-page-logic.test.ts:974` and `:1109`:
   - Replace each `{ ok: true }` sentinel with a valid minimal `GetPracticeSessionReviewOutput`.
   - Prefer a shared local helper or `const reviewOutput = { ... } satisfies GetPracticeSessionReviewOutput`.
   - Minimal valid shape: `sessionId`, `mode`, `totalCount`, `answeredCount`, `markedCount`, `rows`.
   - Use semantic fixture values already present in the file, e.g. `fixtureSession1Id`, `mode: 'tutor'`, zero counts, and `rows: []`.
   - Preserve the tests' identity assertions (`toHaveBeenCalledWith(navigator)` / `toHaveBeenLastCalledWith(summaryReview)`).
2. `history/page.test.tsx:363`:
   - Do not keep a page-level `GetTagsOutput` fixture containing `kind: 'domain'`.
   - Keep the page-level mocked controller DTO production-shaped. The valid page behavior here is filtering hidden-but-valid `diagnosis` tags from the visible options.
   - Preserve invalid `domain` coverage at the real boundary instead. `src/domain/value-objects/tag-kind.test.ts` already proves `isValidTagKind('domain') === false`; add or adjust boundary coverage only if execution finds that proof missing.
   - Do not replace `domain` with another valid kind and claim the invalid-kind case is still covered. Either remove the invalid row from the page DTO and keep/rename the diagnosis-filter assertion, or move the invalid-kind assertion to the boundary layer.
3. `practice-controller-session-lifecycle.test.ts:504`:
   - Preserve the negative test: the controller must return `VALIDATION_ERROR` when the use case returns output rejected by `FinalizeExamAnswersOutputSchema`.
   - Remove the whole-DTO cast. Use a named fixture constrained by the exported type, e.g. `const invalidFinalizeOutput = { ...questionCount: -1... } satisfies FinalizeExamAnswersOutput;`.
   - No residual cast is needed here: the TypeScript output type permits `number`, while the controller output schema rejects negative counts at runtime.

General rule:

- Fixtures must be constrained by the exported controller/use-case output type via `satisfies OutputType`, an explicit variable type, or a typed builder.
- No blanket `as unknown as ...Output`.
- A residual narrow cast is acceptable only for a documented intentional-invalid negative test where a single field must be out of contract and the rest of the fixture remains typed. This audit's recommended recipe does not require such a residual cast.
- Do not add broader runtime validation to tests only to compensate for unsafe casts. The clean fix is to make fixtures satisfy the exported DTO contracts, and to put intentionally invalid cases at the boundary that accepts untrusted input.

---

## Acceptance Criteria

- The narrow sweep command above returns zero whole-DTO mocked-output casts in `app`, `src`, and `components`, except any explicitly justified residual single-field intentional-invalid cast.
- No `as unknown as ...Output` or `as any ...Output` remains at the 4 audited sites.
- Any residual intentional-invalid cast, if execution discovers one is necessary, is single-field, locally commented, and not a whole-DTO bypass.
- The `history/page.test.tsx` tag-filtering intent is preserved without pretending `GetTagsOutput` can contain `kind: 'domain'`; invalid `domain` coverage remains at the tag-kind boundary.
- The finalize-output negative test still proves `FinalizeExamAnswersOutputSchema` rejection.
- Existing intentional `@ts-expect-error` type-contract tests remain if they are proving compile-time rejection and include a clear rationale.
- The affected test files pass directly.
- DEBT-398 scan remains 16/16.
- Full local gate green.
- No production code changes unless a test exposes a real production mapper bug.
