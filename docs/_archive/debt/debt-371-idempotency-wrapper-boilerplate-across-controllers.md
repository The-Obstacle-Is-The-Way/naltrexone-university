# DEBT-371: Idempotency Wrapper Boilerplate Repeated Across Server-Action Controllers

**Priority:** P3
**Created:** 2026-04-25
**Resolution State:** Fixed in PR #293, merged to dev `722825d6` and main on 2026-04-28.
**Source:** Production complexity audit, 2026-04-25
**Related:** [withIdempotency helper](../../src/adapters/shared/with-idempotency.ts), [Master Spec — Idempotency](../specs/master_spec.md)

**Audit verified:** 2026-04-27 against `87284372`.

---

## Context

`withIdempotency()` is invoked at 8 call sites across 4 controllers:

- `src/adapters/controllers/practice-controller.ts:184, 257, 291, 383` (4 actions)
- `src/adapters/controllers/bookmark-controller.ts:103`
- `src/adapters/controllers/question-controller.ts:259`
- `src/adapters/controllers/billing-controller.ts:142, 192`

Each call site repeats the same ~13-line shape:

```typescript
const { someInput, idempotencyKey } = input;

async function executeFn(): Promise<XxxOutput> { /* business logic */ }

if (!idempotencyKey) {
  return executeFn();
}

return withIdempotency({
  repo: d.idempotencyKeyRepository,
  logger: d.logger,
  userId,
  action: 'practice:foo',
  key: idempotencyKey,
  now: d.now,
  parseResult: (value) => XxxOutputSchema.parse(value),
  execute: executeFn,
});
```

Eight times. The action-name string and the output schema are the only meaningful per-action variables.

## Why This Is Debt

The pattern is a candidate for a thin abstraction without the speculative-design risk thin abstractions usually carry, because:

1. The deps (`repo`, `logger`, `now`, `userId`) are always the same — they all come from the controller's `d` (the dependency container) and the resolved user.
2. The schema-roundtrip (`parseResult: (value) => XxxOutputSchema.parse(value)`) is invariant — output is always Zod-parseable.
3. The "if no key, execute directly; else wrap" branching is the same conditional eight times.

A senior engineer reading the same 13-line block at eight call sites would notice it as DRY-eligible. It also makes individual action bodies harder to scan because the actual business logic is buried inside an inner `async function` whose presence is forced by the wrapper, not by the action's own logic.

This is a "rule of three" call: with eight call sites and stable shape, the abstraction is no longer speculative.

## Remediation

Add a controller-side helper:

```typescript
// src/adapters/controllers/shared/execute-idempotent.ts
import type { ZodType, ZodTypeDef } from 'zod';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import type { Logger } from '@/src/application/ports/logger';
import type { IdempotencyKeyRepository } from '@/src/application/ports/repositories';

type IdempotentControllerDeps = {
  idempotencyKeyRepository: IdempotencyKeyRepository;
  logger: Logger;
  now: () => Date;
};

export async function executeIdempotent<TOutput>({
  d,
  userId,
  idempotencyKey,
  action,
  outputSchema,
  execute,
}: {
  d: IdempotentControllerDeps;
  userId: string;
  idempotencyKey: string | null | undefined;
  action: string;
  outputSchema: ZodType<TOutput, ZodTypeDef, unknown>;
  execute: () => Promise<TOutput>;
}): Promise<TOutput> {
  if (!idempotencyKey) return execute();
  return withIdempotency({
    repo: d.idempotencyKeyRepository,
    logger: d.logger,
    userId,
    action,
    key: idempotencyKey,
    now: d.now,
    parseResult: (value) => outputSchema.parse(value),
    execute,
  });
}
```

The helper should depend on the structural subset shared by the affected controller dependency types (`idempotencyKeyRepository`, `logger`, `now`). There is no repo-wide `ControllerDeps` type today; introducing one would be broader than this debt item requires.

Then each call site shrinks to:

```typescript
return executeIdempotent({
  d,
  userId,
  idempotencyKey,
  action: 'practice:startPracticeSession',
  outputSchema: StartPracticeSessionOutputSchema,
  execute: createNewSession,
});
```

Roughly a -80 LOC net change across the 4 controllers, with no behavior change.

## Constraints

- Do NOT also fold rate-limiting into the helper. Rate-limit guards live at action-specific points (e.g., `startPracticeSession` rate-limits before the idempotency wrap, while `endPracticeSession` does not) and conflating them would lose that flexibility.
- Do NOT introduce a "smart" generic that auto-detects the `action` string from the caller's enclosing context. That kind of magic is harder to reason about than the explicit string.
- Do NOT relocate `withIdempotency()` itself. It currently lives in `src/adapters/shared/with-idempotency.ts`; the new controller-side helper composes it.

## Why P3

The current code is correct and tested. The win is pure readability + DRY. Take this on next time more than one of the affected controllers is being touched, or as a self-contained refactor when the team has a slow week.

## Verification

- [x] New helper contract tests cover null/undefined no-key fast paths, keyed delegation, duplicate-key cached return, and cached-result schema parsing: `src/adapters/controllers/shared/execute-idempotent.test.ts`.
- [x] Existing controller tests pass unchanged: `practice-controller.test.ts`, `bookmark-controller.test.ts`, `question-controller.test.ts`, and `billing-controller.test.ts`.
- [x] The 8 controller call sites listed above now use `executeIdempotent(...)`; the only remaining `withIdempotency(...)` under `src/adapters/controllers/` is inside the helper.
- [x] Full pre-push gate passed: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
- [x] Local authenticated E2E passed because the environment was present: `pnpm test:e2e` (34/34).
