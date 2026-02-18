# DEBT-228: DRY fake-use-cases.ts With Generic Base Class

**Status:** Open
**Priority:** P4
**Date:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/test-helpers/fakes/fake-use-cases.ts`

---

## Description

`fake-use-cases.ts` is **320 lines** containing **15** nearly identical fake use case implementations. Every class follows the same pattern:

```typescript
export class FakeXxxUseCase implements UseCase<Input, Output> {
  readonly inputs: Input[] = [];
  constructor(private readonly output: Output, private readonly toThrow?: unknown) {}
  async execute(input: Input): Promise<Output> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}
```

The only variation between classes is the type parameters.

**Disposition:** C - Extractable boilerplate/duplication.

## Impact

- Adding a new use case fake requires copy-pasting ~20 lines of identical boilerplate
- 15 copies of the same logic is a DRY violation
- Bug fixes to the fake pattern must be applied in many places

## Why This Is Worth Fixing

- **Robustness gain:** one behavior implementation means fewer divergence bugs in test doubles.
- **Complexity risk to avoid:** do not hide behavior behind opaque metaprogramming; keep named classes for readability.

## Resolution

Extract a generic `FakeUseCase<I, O>` base class and derive named types from it:

```typescript
export class FakeUseCase<I, O> implements UseCase<I, O> {
  readonly inputs: I[] = [];
  constructor(private readonly output: O, private readonly toThrow?: unknown) {}
  async execute(input: I): Promise<O> {
    this.inputs.push(input);
    if (this.toThrow) throw this.toThrow;
    return this.output;
  }
}

// Named exports for type safety and discoverability
export class FakeGetNextQuestionUseCase extends FakeUseCase<
  GetNextQuestionInput,
  GetNextQuestionOutput
> {}
// ... etc.
```

This preserves named classes (important for test readability and potential `instanceof` checks) while removing repeated method bodies.

Guardrail: if any fake needs custom behavior, that fake should stay standalone rather than forcing inheritance.

## Verification

- [ ] Generic `FakeUseCase<I, O>` base class exists
- [ ] All 15 named fakes extend it (no duplicate `execute()` implementations)
- [ ] All existing imports and `instanceof` checks still work
- [ ] `fakes.test.ts` passes without modification (or with minimal updates)
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes

## Related

- [DEBT-227](debt-227-split-fake-repositories-into-individual-files.md) - Companion split of fake repositories
- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
