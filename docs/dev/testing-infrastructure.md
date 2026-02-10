# Testing Infrastructure

**Last Updated:** 2026-02-10

This document covers our E2E testing tools: Playwright and Vercel's agent-browser.

---

## Overview

| Tool | Purpose | When to Use |
| ---- | ------- | ----------- |
| **Playwright** | Scripted E2E tests | Regression testing, CI validation |
| **Agent-Browser** | AI-driven exploration | Autonomous bug discovery, exploratory testing |
| **Webapp-Testing Skill** | Python Playwright helpers | Complex automation scenarios |

---

## Playwright

### Configuration

**File:** `playwright.config.ts`

```ts
testDir: './tests/e2e',
fullyParallel: true,
retries: process.env.CI ? 2 : 0,
workers: 1,
webServer: {
  command: process.env.CI ? 'pnpm start' : 'pnpm dev',
  reuseExistingServer: !process.env.CI,
},
```

- Uses `NEXT_PUBLIC_APP_URL` or defaults to `http://127.0.0.1:3000`
- Runs Chromium only (for now)
- Auto-starts dev server (`pnpm dev`) or uses production build in CI (`pnpm start`)
- Runs with **1 worker** to avoid shared-user state conflicts (bookmarks, session continuation)

### Existing Tests

| File | Purpose |
| ---- | ------- |
| `tests/e2e/global.setup.ts` | Shared setup (Playwright project dependency) |
| `tests/e2e/smoke.spec.ts` | Marketing smoke (home, pricing) |
| `tests/e2e/pricing-unauthenticated.spec.ts` | Pricing behavior for signed-out users |
| `tests/e2e/theme-preference.spec.ts` | Theme preference persistence |
| `tests/e2e/dark-mode.spec.ts` | Dark mode toggle and OS preference |
| `tests/e2e/marketing-contrast.spec.ts` | Marketing contrast regression checks |
| `tests/e2e/subscribe.spec.ts` | Subscription verification (API-seeded) |
| `tests/e2e/subscribe-and-practice.spec.ts` | Subscribe + answer a question |
| `tests/e2e/practice.spec.ts` | Practice session answering flow |
| `tests/e2e/session-continuation.spec.ts` | Resume incomplete session |
| `tests/e2e/review.spec.ts` | Missed questions review flow |
| `tests/e2e/bookmarks.spec.ts` | Bookmarks CRUD flow |
| `tests/e2e/core-app-pages.spec.ts` | Entitled app pages load |

### Running E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI (interactive)
pnpm playwright test --ui

# Run specific test file
pnpm playwright test smoke.spec.ts

# Debug mode
pnpm playwright test --debug
```

### Environment Variables for E2E

For tests requiring Clerk authentication:

```bash
E2E_CLERK_USER_USERNAME=test@example.com
E2E_CLERK_USER_PASSWORD=your-password
```

These can be provided via `.env.local` (loaded by `playwright.config.ts`) or CI secrets. Tests that require auth will `test.skip()` when these are missing.

### Test Data Seeding

Subscription data is seeded via the Stripe API and direct DB writes in `global.setup.ts` — **no Stripe UI automation**. The `seedTestSubscription()` helper (in `tests/e2e/helpers/seed-test-user.ts`) runs before any test and idempotently ensures:

1. The test user exists in the `users` table (matched by email, Clerk user ID resolved via Clerk API)
2. A Stripe customer exists (checked in DB, then Stripe API, created if needed) and is mirrored in `stripe_customers`
3. An active subscription exists (using `pm_card_visa` test payment method) and is mirrored in `stripe_subscriptions`

Seeding is skipped when `E2E_CLERK_USER_USERNAME` or `STRIPE_SECRET_KEY` are missing. Tests that depend on subscription already skip when Clerk credentials are absent, so this is safe.

### Writing New E2E Tests

```typescript
import { expect, test } from '@playwright/test';

test.describe('feature name', () => {
  test('user can do X', async ({ page }) => {
    await page.goto('/path');

    // Use role-based selectors (accessibility-friendly)
    await page.getByRole('button', { name: 'Submit' }).click();

    // Assert on visible content
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

**Best Practices:**
- Use `getByRole()`, `getByLabel()`, `getByText()` over CSS selectors
- Wait for network: `await page.waitForLoadState('networkidle')`
- Use `expect(locator).toBeVisible()` not `isVisible()`

---

## Agent-Browser (Vercel)

### What Is It?

Vercel's agent-browser is an AI-powered CLI that lets AI agents control Chrome for autonomous testing and exploration. Unlike Playwright (scripted), agent-browser explores intelligently.

**Install:**
```bash
npm install -g agent-browser
```

**Install browser binaries (first time):**
```bash
agent-browser install
```

**Verify:**
```bash
agent-browser --version  # Should show 0.8.x
```

### Core Concepts

1. **Accessibility Tree Snapshots** — Agent-browser works with the A11y tree, not raw DOM
2. **Refs** — Elements are referenced as `@e1`, `@e2`, etc. (not CSS selectors)
3. **Non-Visual** — The AI "sees" the page structure, not pixels

### Basic Usage

```bash
# Open a page (starts the browser automatically)
agent-browser open http://localhost:3000

# Snapshot interactive elements (recommended)
agent-browser snapshot -i

# Interact using @refs from the snapshot
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser wait --load networkidle

# Evidence
agent-browser screenshot /tmp/agent-browser.png --full

# Cleanup
agent-browser close
```

### Authenticated Exploration

By default, `agent-browser` does **not** load `.env.local`. If you want to explore authenticated pages, prefer loading a Playwright `storageState` file:

1) Create a temporary script that signs in via Clerk and saves `storageState`:

```ts
// scripts/tmp-create-agent-browser-state.ts (do not commit)
import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { config } from 'dotenv';
import { chromium } from '@playwright/test';

async function main() {
  config({ path: '.env.local' });
  config({ path: '.env' });

  const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  if (!username || !password) throw new Error('Missing Clerk E2E credentials');

  await clerkSetup();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: username, password },
  });

  await page.goto('/app/dashboard');
  await context.storageState({ path: '/tmp/agent-browser-state.json' });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

2) Run it:

```bash
pnpm tsx scripts/tmp-create-agent-browser-state.ts
```

3) Use agent-browser with the saved state:

```bash
agent-browser --state /tmp/agent-browser-state.json open http://localhost:3000/app/dashboard
```

If you prefer to log in “by hand”, you can also use `--profile` to persist cookies across sessions:

```bash
agent-browser --profile /tmp/agent-browser-profile open http://localhost:3000/sign-in
```

**Command reference:** `.agents/skills/agent-browser/SKILL.md`

---

## Webapp-Testing Skill

**Location:** `.agents/skills/webapp-testing/`

Python-based Playwright helpers for complex automation.

### Available Scripts

| Script | Purpose |
| ------ | ------- |
| `scripts/with_server.py` | Manages server lifecycle during tests |

### Example Usage

```bash
# Start server and run automation
python .agents/skills/webapp-testing/scripts/with_server.py \
  --server "pnpm dev" --port 3000 \
  -- python your_script.py
```

### When to Use

- Complex multi-step scenarios
- Screenshot-based debugging
- Console log analysis
- When you need synchronous Python control

---

## CI Integration

### GitHub Actions

E2E tests run in CI via Playwright (see `.github/workflows/ci.yml`):

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Run E2E tests
  run: pnpm test:e2e
  env:
    E2E_CLERK_USER_USERNAME: ${{ secrets.E2E_CLERK_USER_USERNAME }}
    E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
```

### Required Secrets

| Secret | Purpose |
| ------ | ------- |
| `E2E_CLERK_USER_USERNAME` | Test Clerk account username (email) |
| `E2E_CLERK_USER_PASSWORD` | Test Clerk account password |
| `CLERK_SECRET_KEY` | Clerk API key (used to resolve Clerk user ID during seeding) |
| `STRIPE_SECRET_KEY` | Stripe API key (used to create test subscriptions during seeding) |
| `DATABASE_URL` | Postgres connection string (used for direct DB writes during seeding) |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | Stripe monthly price ID (used during subscription seeding) |

---

## Test Coverage Gaps

Playwright coverage intentionally focuses on user-facing regression paths:

- Marketing pages + theme/dark-mode
- Auth + subscription (API-seeded, verified in-app) when E2E Clerk creds are present
- Practice sessions + continuation
- Review + bookmarks

For feature-level acceptance criteria and planned routes (e.g., Quick Practice at `/app/practice/quick`), track expected E2E additions in the relevant specs (e.g., SPEC-019 Phase 2 acceptance criteria).

---

## Troubleshooting

### Playwright won't start server

```bash
# Kill any zombie processes
lsof -ti:3000 | xargs kill -9

# Clear Next.js cache
rm -rf .next
```

### Agent-browser can't connect

Ensure Chrome is installed and not running with restrictive flags:
```bash
# macOS - kill Chrome completely
killall "Google Chrome"
```

### Agent-browser says “Browser not launched”

- Run `agent-browser install` (first-time setup)
- Then run `agent-browser close` and retry your `agent-browser open …` command

### Tests flaky on CI

- Increase `timeout` in playwright.config.ts
- Use `waitForLoadState('networkidle')` before assertions
- Add explicit waits: `await page.waitForTimeout(1000)`

---

## Related Documentation

- [react-vitest-testing.md](./react-vitest-testing.md) — React 19 + Vitest component testing setup
- [CLAUDE.md](../../CLAUDE.md) — Testing mandate and test locations
- [SPEC-010](../specs/spec-010-server-actions.md) — Controller testing patterns
- [Stripe vendor docs](../vendor-docs/stripe.md) — E2E test seeding pattern, test payment methods
- [Clerk vendor docs](../vendor-docs/clerk.md) — REST API for user lookup in E2E seeding
- [Playwright Docs](https://playwright.dev/docs/intro)
- `.agents/skills/agent-browser/SKILL.md` — Agent-browser CLI usage + workflow
