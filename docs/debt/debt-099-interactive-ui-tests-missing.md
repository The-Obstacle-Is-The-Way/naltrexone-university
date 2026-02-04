# DEBT-099: Interactive UI Tests Missing — Client Components Have Zero Interaction Coverage

**Status:** Open
**Priority:** P1
**Date:** 2026-02-04

---

## Description

All 37 `.test.tsx` files in the codebase use `renderToStaticMarkup` from `react-dom/server`, which only tests **render output** (HTML content). No test verifies any user interaction: button clicks, form submissions, state changes, menu toggling, or any `useState`/`useEffect` behavior.

This was an intentional, pragmatic decision documented in `docs/dev/react-vitest-testing.md`. When the testing infrastructure was set up (2026-02-01), the React 19 testing ecosystem was broken:

- `@testing-library/react` had a known `act()` bug with React 19 + Vitest ([#1392](https://github.com/testing-library/react-testing-library/issues/1392))
- `vitest-browser-react` had the same bug with React 19's `use()` + suspense ([Issue #9](https://github.com/vitest-community/vitest-browser-react/issues/9))

**The ecosystem has since caught up.** Both blocking issues are resolved:

- [Issue #8 — React 19 support](https://github.com/vitest-community/vitest-browser-react/issues/8): Closed June 14, 2025
- [Issue #9 — Suspense/act() bug](https://github.com/vitest-community/vitest-browser-react/issues/9): Closed July 23, 2025 (PR #22 — async `render()` API)
- [Vitest 4](https://vitest.dev/guide/browser/) (October 2025): Browser Mode marked **stable**
- `vitest-browser-react` v2.0.0+: Breaking change made `render()` return a Promise, properly awaiting `act()`

We are on Vitest 4.0.18, which meets the requirements. The path is now clear.

## Current State

### What IS tested (37 `.test.tsx` files)

All component tests verify render output only:

```typescript
// Every test follows this pattern
const html = renderToStaticMarkup(<Component {...props} />);
expect(html).toContain('Expected text');
```

This correctly validates: HTML structure, conditional rendering branches, props-to-content mapping, server component output.

### What is NOT tested — Interactive Client Components

| Component | File | Untested Interactions | Priority |
|-----------|------|----------------------|----------|
| PracticeSessionPageClient | `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` | 7 useState hooks, answer selection, submit, bookmark, next question, end session, retry | **Critical** |
| ChoiceButton | `components/question/ChoiceButton.tsx` | Radio click, onChange callback firing | High |
| QuestionCard | `components/question/QuestionCard.tsx` | Choice selection, onSelectChoice callback | High |
| MobileNav | `components/mobile-nav.tsx` | Hamburger toggle (open/close menu), link clicks | Medium |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | Trigger click, menu open/close, item selection | Medium |
| RadioGroup | `components/ui/radio-group.tsx` | Radio selection, value changes | Medium |
| ThemeToggle | `components/theme-toggle.tsx` | Theme button click, setTheme() | Low |
| ThemeProvider | `components/theme-provider.tsx` | Context setup, theme persistence | Low |

### Interaction patterns currently untestable with `renderToStaticMarkup`

- `onClick` / `onChange` handlers and their side effects
- `useState` state transitions
- `useTransition` pending states
- `useEffect` side effects (do not run in SSR)
- `useMemo` / `useCallback` memoized computations
- Form validation and submission
- Menu/popover open/close toggling
- Dynamic content rendering based on state changes

## Impact

- **Test confidence gap:** The most complex, bug-prone component (`PracticeSessionPageClient` — 7 useState hooks, 4 useMemo callbacks, complex state machine) has **zero tests**
- **Regression risk:** UI interactions can break silently — no test catches a broken onClick handler
- **Uncle Bob non-compliance:** CLAUDE.md mandates TDD and comprehensive testing. Interactive behavior is the majority of what users actually experience
- **False confidence:** 714 passing tests suggest thorough coverage, but none test what users actually *do* (click buttons, submit answers, toggle bookmarks)

## Resolution

### The Right Tool: `vitest-browser-react` + Vitest Browser Mode

[Vitest Browser Mode](https://vitest.dev/guide/browser/) runs tests in real browsers (Chromium via Playwright), not simulated DOM environments. `vitest-browser-react` is the [official community package](https://github.com/vitest-community/vitest-browser-react) for React component testing in Browser Mode, endorsed by Kent C. Dodds (Testing Library creator).

**Why this is the right solution (not `@testing-library/react`):**
- `@testing-library/react` is in zombie maintenance mode — 1 part-time maintainer, 63+ open issues, no React 19 fix timeline
- `vitest-browser-react` is the endorsed successor with the same API patterns
- Tests run in a real browser, catching CSS/layout/API issues that jsdom misses
- Built-in retry-ability via `expect.element()` — no manual `waitFor` calls
- Properly handles React 19's async patterns (suspense, use(), transitions)

### Step 1: Install dependencies

```bash
pnpm add -D vitest-browser-react @vitest/browser-playwright
```

### Step 2: Add browser test configuration

Create `vitest.browser.config.ts` (separate from existing `vitest.config.ts`):

```typescript
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    include: ['**/*.browser.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

### Step 3: Add npm script

```json
{
  "scripts": {
    "test:browser": "vitest --config vitest.browser.config.ts"
  }
}
```

### Step 4: Write interactive tests (TDD)

New interactive test files use `*.browser.test.tsx` naming convention to separate from existing `renderToStaticMarkup` tests:

```typescript
// components/question/ChoiceButton.browser.test.tsx
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

test('fires onChange when clicked', async () => {
  const onChange = vi.fn();
  const screen = await render(
    <ChoiceButton
      choiceId="c1"
      label="Naltrexone"
      name="q1"
      onChange={onChange}
    />
  );

  await screen.getByRole('radio', { name: 'Naltrexone' }).click();
  expect(onChange).toHaveBeenCalledWith('c1');
});
```

### Step 5: Prioritized test backfill

| Priority | Component | Test File | Key Interactions to Test |
|----------|-----------|-----------|------------------------|
| 1 | PracticeSessionPageClient | `practice-session-page-client.browser.test.tsx` | Select choice, submit answer, bookmark, next question, end session |
| 2 | ChoiceButton | `ChoiceButton.browser.test.tsx` | Radio click, onChange callback |
| 3 | QuestionCard | `QuestionCard.browser.test.tsx` | Choice selection, callback invocation |
| 4 | MobileNav | `mobile-nav.browser.test.tsx` | Hamburger toggle, menu visibility |
| 5 | DropdownMenu | `dropdown-menu.browser.test.tsx` | Trigger click, menu items |
| 6 | ThemeToggle | `theme-toggle.browser.test.tsx` | Theme switching |

### Step 6: Update documentation

Update `docs/dev/react-vitest-testing.md`:
- Change "vitest-browser-react — use when ready" → "vitest-browser-react — READY (both bugs fixed mid-2025)"
- Add setup instructions for Browser Mode
- Add `*.browser.test.tsx` naming convention
- Update the checklist section

### Step 7: Coexistence with existing tests

Existing `renderToStaticMarkup` tests remain — they are correct and valuable for render-output testing. The two approaches coexist:

| Convention | Runner | Purpose |
|------------|--------|---------|
| `*.test.tsx` | Vitest (jsdom) | Render output, HTML content |
| `*.browser.test.tsx` | Vitest Browser Mode (Chromium) | Clicks, forms, state changes |
| `*.test.ts` | Vitest (node) | Domain logic, use cases |
| `*.spec.ts` | Playwright | Full E2E user journeys |

## Verification

- [ ] `vitest-browser-react` and `@vitest/browser-playwright` installed
- [ ] `vitest.browser.config.ts` created with Playwright provider
- [ ] `pnpm test:browser` script works
- [ ] PracticeSessionPageClient has interactive tests (highest priority gap)
- [ ] ChoiceButton onClick/onChange tested
- [ ] MobileNav hamburger toggle tested
- [ ] All existing 714+ `renderToStaticMarkup` tests still pass unchanged
- [ ] `docs/dev/react-vitest-testing.md` updated to reflect ecosystem fix
- [ ] CLAUDE.md updated with `*.browser.test.tsx` convention

## Related

- `docs/dev/react-vitest-testing.md` — Current testing guide (needs update, says "not ready")
- `docs/dev/testing-infrastructure.md` — E2E testing tools
- `CLAUDE.md` — TDD mandate and testing requirements
- [vitest-browser-react](https://github.com/vitest-community/vitest-browser-react) — Official React testing for Vitest Browser Mode
- [Vitest Browser Mode docs](https://vitest.dev/guide/browser/) — Stable since Vitest 4 (October 2025)
- [Vitest Component Testing](https://vitest.dev/guide/browser/component-testing) — Official component testing guide
- [Epic Web Dev — React Component Testing with Vitest Browser Mode](https://www.epicweb.dev/events/react-component-testing-with-vitest-browser-mode-02-2025) — Workshop by Kent C. Dodds
- [InfoQ — Vitest Browser Mode as JSDOM Alternative](https://www.infoq.com/news/2025/06/vitest-browser-mode-jsdom/) — Industry coverage

## Sources

All ecosystem status claims validated:

- [vitest-browser-react Issue #8 (React 19)](https://github.com/vitest-community/vitest-browser-react/issues/8) — Closed June 14, 2025
- [vitest-browser-react Issue #9 (Suspense/act)](https://github.com/vitest-community/vitest-browser-react/issues/9) — Closed July 23, 2025
- [vitest-browser-react Releases](https://github.com/vitest-community/vitest-browser-react/releases) — v2.0.5 latest
- [@testing-library/react Issue #1392](https://github.com/testing-library/react-testing-library/issues/1392) — Still open, zombie maintenance
