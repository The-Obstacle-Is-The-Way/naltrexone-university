# DEBT-371: Idempotency Wrapper Boilerplate Repeated Across Server-Action Controllers

**Priority:** P3
**Created:** 2026-04-25
**Source:** Production complexity audit, 2026-04-25
**Related:** [withIdempotency helper](../../src/adapters/shared/with-idempotency.ts), [Master Spec — Idempotency](../specs/master_spec.md)

**Audit verified:** 2026-04-25 against `0ec1b1fd`.

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
import type { ZodSchema } from 'zod';
import { withIdempotency } from '@/src/adapters/shared/with-idempotency';
import type { ControllerDeps } from '...'; // existing deps type

export async function executeIdempotent<TOutput>({
  d,
  userId,
  idempotencyKey,
  action,
  outputSchema,
  execute,
}: {
  d: ControllerDeps;
  userId: string;
  idempotencyKey: string | null | undefined;
  action: string;
  outputSchema: ZodSchema<TOutput>;
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

- All existing controller tests pass unchanged. The helper is a transparent wrapper — there is no new behavior to test beyond what `withIdempotency()` already covers.
- The 8 call sites listed above each shrink by ~10 lines.
- `pnpm typecheck && pnpm lint && pnpm test --run`.
