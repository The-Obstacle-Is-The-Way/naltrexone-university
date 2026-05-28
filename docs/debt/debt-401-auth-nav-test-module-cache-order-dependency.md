# DEBT-401: AuthNav Test Module-Cache Order Dependency

**Priority:** P2 (confirmed hidden unit-test order dependency. The full unit suite passes in declaration order, but `pnpm test --run --sequence.shuffle` can fail before any DEBT-395 fixes land. This blocks using shuffled unit runs as a clean process-env isolation signal until the test is fixed.)
**Created:** 2026-05-28
**Source:** DEBT-395 PR 1 pre-execution audit. The required shuffled-order verification exposed a separate `components/auth-nav.test.tsx` module-cache/mock-order dependency with seed `1779972928761`.
**Related:** [DEBT-395](./debt-395-test-environment-isolation-hardening.md), [components/auth-nav.test.tsx](../../components/auth-nav.test.tsx), [components/marketing/marketing-layout.tsx](../../components/marketing/marketing-layout.tsx), [components/auth-nav.tsx](../../components/auth-nav.tsx)

**Status:** Active

---

## Problem

`components/auth-nav.test.tsx` passes in declaration order but fails under shuffled test order:

```sh
pnpm test --run components/auth-nav.test.tsx --sequence.shuffle --sequence.seed=1779972928761 --reporter verbose
```

Failure:

```text
components/auth-nav.test.tsx > AuthNav > scenario 4: authenticated entitled marketing pages keep a single Dashboard escape hatch
AssertionError: expected null not to be null
components/auth-nav.test.tsx:248
```

Verbose order for seed `1779972928761` runs scenario 4 first. In that order, line 248 fails because `[data-testid="user-button"]` is absent.

## Root Cause

The test file imports `MarketingLayout` at module scope:

```typescript
import { MarketingLayout } from '@/components/marketing/marketing-layout';
```

`marketing-layout.tsx` imports `AuthNav` at module scope, and `auth-nav.tsx` imports `AuthUserButton` at module scope:

```typescript
import { AuthNav } from '@/components/auth-nav';
import { AuthUserButton } from '@/components/auth-user-button';
```

Several tests then try to mock `./auth-user-button` inside individual `it()` blocks before dynamically importing `./auth-nav`:

```typescript
vi.doMock('./auth-user-button', () => ({
  AuthUserButton: () => <div data-testid="user-button" />,
}));

const { AuthNav } = await import('./auth-nav');
```

When scenario 4 runs first, `AuthNav` has already been imported indirectly by the module-scope `MarketingLayout` import. The per-test `vi.doMock()` is therefore too late for that cached module graph. The suite only passes in normal declaration order because an earlier test's `afterEach` calls `vi.resetModules()`, accidentally clearing the module cache before scenario 4.

This is the same broad class of test isolation debt as DEBT-395, but the mechanism is module-cache/mock ordering rather than `process.env` leakage.

## Required Remediation

Single focused test-only PR, or a clearly separated companion commit in the DEBT-395 PR 1 execution branch if that PR must make `pnpm test --run --sequence.shuffle` green.

Recommended fix:

1. Remove the module-scope `MarketingLayout` import from `components/auth-nav.test.tsx`.
2. Dynamically import `MarketingLayout` inside `renderMarketingLayout()` after the test has had a chance to call `vi.doMock()` and after module cache reset.
3. Prefer a `beforeEach` that restores env, calls `vi.resetModules()`, and calls `vi.restoreAllMocks()` so the first shuffled test gets the same clean module-cache state as later tests.
4. Keep the existing module-scope `ORIGINAL_ENV = snapshotProcessEnv()` pattern.

Concrete shape:

```typescript
async function renderMarketingLayout(authNavSlot: ReactNode) {
  const { MarketingLayout } = await import('@/components/marketing/marketing-layout');
  const element = await MarketingLayout({
    authNavSlot,
    featuresHref: '#features',
    children: <div>Child content</div>,
  });

  return renderToStaticMarkup(element);
}
```

Then add:

```typescript
beforeEach(() => {
  restoreProcessEnv(ORIGINAL_ENV);
  vi.resetModules();
  vi.restoreAllMocks();
});
```

Keep the existing `afterEach` cleanup, or make `beforeEach` and `afterEach` symmetric if the final code reads cleaner.

## Acceptance Criteria

- `pnpm test --run components/auth-nav.test.tsx --sequence.shuffle --sequence.seed=1779972928761 --reporter verbose` passes.
- `pnpm test --run --sequence.shuffle` passes after DEBT-395 PR 1 process-env fixes also land.
- No production code changes.
- `components/auth-nav.test.tsx` no longer relies on an earlier test's `afterEach` to make per-test `vi.doMock('./auth-user-button')` effective.

## Risk and Reversibility

Risk is low. The fix should only change test import timing and cleanup symmetry. If it exposes a production dependency on module-evaluation order, that is useful signal and should be investigated before merging.

