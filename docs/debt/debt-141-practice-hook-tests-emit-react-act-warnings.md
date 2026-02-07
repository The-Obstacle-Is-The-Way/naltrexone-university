# DEBT-141: Migrate Practice Hook Tests from renderLiveHook to Browser Mode

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

Six practice hook test files use `renderLiveHook` — a custom jsdom harness built before Vitest Browser Mode was set up (Feb 1). This harness uses `createRoot` in jsdom, which produces repeated React act() warnings because jsdom's `createRoot` goes through React 19's concurrent scheduler without `act()` wrapping.

**The fix is not to suppress act() warnings.** The fix is to migrate these tests to `vitest-browser-react` in Browser Mode, which runs in real Chromium and uses Chrome DevTools Protocol (CDP) instead of `act()` for synchronization. Zero act() warnings.

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

## Resolution

1. For each file, create a `*.browser.spec.tsx` counterpart using `vitest-browser-react`'s `render`
2. Wrap hook under test in a minimal `<HookConsumer>` component that renders testable output
3. Use `expect.element(locator)` for assertions (built-in retry-ability, no manual polling)
4. Remove the original `*.test.tsx` once the browser spec has equivalent coverage
5. After all 6 files are migrated, delete `render-live-hook.tsx` and its test

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
