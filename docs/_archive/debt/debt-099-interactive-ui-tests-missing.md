# DEBT-099: Interactive UI Tests Missing — Client Components Had Zero Interaction Coverage

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

The repo had stable render-output `.test.tsx` coverage via `renderToStaticMarkup`, but **no unit-level interactive UI tests** (clicks, state transitions) for client components.

## Resolution

Added a dedicated Vitest Browser Mode runner and initial interactive tests:

- `vitest.browser.config.ts`: Browser Mode config (Chromium via Playwright provider)
- `vitest.browser.setup.ts`: Enables `vitest-browser-react`
- `package.json`: `test:browser` script (`vitest run --config vitest.browser.config.ts`)
- Interactive tests (browser mode):
  - `components/question/ChoiceButton.browser.spec.tsx`
  - `components/question/QuestionCard.browser.spec.tsx`
  - `components/mobile-nav.browser.spec.tsx`

Key conventions:

- Keep existing `.test.tsx` render-only tests (React 19 + Vitest CI stability).
- Use `*.browser.spec.tsx` for interactive component tests (Browser Mode).

## Verification

- `pnpm test:browser`
- Existing gates remain green:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test --run`

## Related

- `docs/dev/react-vitest-testing.md`

