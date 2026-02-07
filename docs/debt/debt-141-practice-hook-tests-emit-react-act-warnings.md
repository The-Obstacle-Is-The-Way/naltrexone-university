# DEBT-141: Migrate Practice Hook Tests from renderLiveHook to Browser Mode

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

Six practice hook test files use `renderLiveHook` — a custom jsdom harness built before Vitest Browser Mode was set up (Feb 1). This harness uses `createRoot` in jsdom, which produces repeated React act() warnings because jsdom's `createRoot` goes through React 19's concurrent scheduler without `act()` wrapping.

**The fix is not to suppress act() warnings.** The fix is to migrate these tests to `vitest-browser-react` in Browser Mode, which runs in real Chromium and uses CDP + locator retry semantics for synchronization. `renderHook()` still exposes `act()` for explicit state transitions, but this migration removes the current jsdom warning pattern.

Browser Mode infrastructure already exists in this repo (`vitest.browser.config.ts`, `pnpm test:browser`, 3 existing `.browser.spec.tsx` files).

## Files to Migrate

| Current file (jsdom + renderLiveHook) | Target |
|---------------------------------------|--------|
| `app/(app)/app/practice/hooks/use-practice-session-controls.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/hooks/use-practice-question-flow.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.test.tsx` | `*.browser.spec.tsx` |

**Retire after migration:**
- `src/application/test-helpers/render-live-hook.tsx`
- `src/application/test-helpers/render-live-hook.test.tsx`

**Keep (no act() warnings, uses renderToStaticMarkup internally):**
- `src/application/test-helpers/render-hook.tsx`

## Impact

- Noisy test output: act() warnings during `pnpm test --run` make real failures harder to spot
- False confidence: warnings suggest test synchronization is imprecise
- Developer confusion: unclear which harness to use for new hook tests

## Key Pattern: `vi.mock({ spy: true })` for Sealed ESM

Browser Mode uses native ESM — namespace objects are **sealed** by the browser runtime.
`vi.spyOn(controllerNamespace, 'method')` will throw. Use the Vitest-native `{ spy: true }` option instead:

```typescript
import * as practiceController from '@/src/adapters/controllers/practice-controller';

// Hoisted before imports — wraps every export as a spy without replacing it
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });

// Per-test: use vi.mocked() to override the spy
vi.mocked(practiceController.getSessionHistory).mockResolvedValue(ok({...}));
```

This is semantically identical to `vi.spyOn()` — it observes calls and allows per-test overrides — but works with sealed ESM namespaces. Supported since Vitest 3.1.0; we run 4.0.18.

See: [Vitest — Mocking Modules (spy: true)](https://vitest.dev/guide/mocking/modules)

## Resolution

1. For each file, create a `*.browser.spec.tsx` counterpart using `vitest-browser-react` (`render` or `renderHook`, whichever fits the test)
2. Replace `vi.spyOn(ns, 'method')` calls with top-level `vi.mock(modulePath, { spy: true })` + per-test `vi.mocked(ns.method).mockResolvedValue(...)`
3. For `render`, wrap the hook under test in a minimal `<HookConsumer>` component that renders testable output
4. Use `expect.element(locator)` for async assertions; use returned `act` from `renderHook` when explicit update boundaries are needed
5. Remove the original `*.test.tsx` once the browser spec has equivalent coverage
6. After all 6 files are migrated, delete `render-live-hook.tsx` and its test

## Verification

- [ ] All 6 hook tests pass as `*.browser.spec.tsx` via `pnpm test:browser`
- [ ] `pnpm test --run` produces zero React act() warnings from practice hook tests
- [ ] `render-live-hook.tsx` and `render-live-hook.test.tsx` are deleted
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test --run` passes

## Related

- `docs/dev/react-vitest-testing.md` — Testing strategy and migration guide
- `vitest.browser.config.ts` — Browser Mode configuration
- [vitest-browser-react (GitHub)](https://github.com/vitest-community/vitest-browser-react)
- [Vitest Browser Mode — Component Testing](https://vitest.dev/guide/browser/component-testing)
