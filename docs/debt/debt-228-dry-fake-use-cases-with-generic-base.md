# DEBT-228: DRY fake-use-cases.ts With Generic Base Class

**Status:** Open
**Priority:** P4
**Date:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/test-helpers/fakes/fake-use-cases.ts`

---

## Description

`fake-use-cases.ts` is **320 lines** containing 14 nearly identical fake use case implementations. Every class follows the exact same pattern:

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

**Disposition:** C — Extractable boilerplate/duplication.

## Impact

- Adding a new use case fake requires copy-pasting ~20 lines of identical boilerplate
- 14 copies of the same logic is a DRY violation
- Bug fixes to the fake pattern must be applied 14 times

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

This preserves named classes (important for test readability and `instanceof` checks) while eliminating ~200 lines of duplication.

## Verification

- [ ] Generic `FakeUseCase<I, O>` base class exists
- [ ] All 14 named fakes extend it (no duplicate `execute()` implementations)
- [ ] All existing imports and `instanceof` checks still work
- [ ] `fakes.test.ts` passes without modification (or with minimal updates)
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes

## Related

- [DEBT-227](debt-227-split-fake-repositories-into-individual-files.md) — Companion: split fake-repositories.ts
- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
