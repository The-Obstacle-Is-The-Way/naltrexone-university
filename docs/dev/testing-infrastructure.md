# Testing Infrastructure

**Last Updated:** 2026-02-01

This document covers our E2E testing tools: Playwright and Vercel's agent-browser.

---

## Overview

| Tool | Purpose | When to Use |
|------|---------|-------------|
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
workers: process.env.CI ? 1 : undefined,
```

- Uses `NEXT_PUBLIC_APP_URL` or defaults to `http://127.0.0.1:3000`
- Runs Chromium only (for now)
- Auto-starts dev server (`pnpm dev`) or uses production build in CI (`pnpm start`)

### Existing Tests

| File | Purpose |
|------|---------|
| `tests/e2e/smoke.spec.ts` | Public pages load (home, pricing) |
| `tests/e2e/dark-mode.spec.ts` | Dark mode toggle and OS preference |
| `tests/e2e/subscribe-and-practice.spec.ts` | Full user journey (subscribe → practice) |

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

The `subscribe-and-practice.spec.ts` test skips if these aren't set.

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
# Start interactive session
agent-browser

# Run a task
agent-browser --task "Navigate to localhost:3000 and check if the pricing page loads"
```

### Using for Bug Discovery

```bash
# Exploratory testing prompt
agent-browser --task "
  Navigate to http://localhost:3000
  Explore all navigation links
  Check for:
  - Broken links (404s)
  - Missing content
  - Console errors
  - Accessibility issues
  Report any bugs found
"
```

### Integration with AI Agents

AI agents (Claude, Codex) can use agent-browser via the MCP tools:
- `mcp__claude-in-chrome__*` — Browser automation tools

When these tools are available, agents can:
- Navigate to pages
- Click elements
- Fill forms
- Check console logs
- Record GIFs of interactions

---

## Webapp-Testing Skill

**Location:** `.agents/skills/webapp-testing/`

Python-based Playwright helpers for complex automation.

### Available Scripts

| Script | Purpose |
|--------|---------|
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

E2E tests run in CI via Playwright:

```yaml
# .github/workflows/ci.yml (example)
- name: Run E2E tests
  run: pnpm test:e2e
  env:
    E2E_CLERK_USER_USERNAME: ${{ secrets.E2E_CLERK_USER_USERNAME }}
    E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
```

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `E2E_CLERK_USER_USERNAME` | Test Clerk account username |
| `E2E_CLERK_USER_PASSWORD` | Test Clerk account password |

---

## Test Coverage Gaps

The following specs need E2E test coverage:

| Spec | Current Status | E2E Test Needed |
|------|----------------|-----------------|
| SPEC-010 Server Actions | Partial | Controllers integration |
| SPEC-011 Paywall | Partial | Subscription gating |
| SPEC-012 Question Loop | Partial | Full practice flow |
| SPEC-013 Practice Sessions | Ready | Session management |
| SPEC-014 Review + Bookmarks | Ready | Bookmark CRUD |
| SPEC-015 Dashboard | Ready | Stats display |

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

### Tests flaky on CI

- Increase `timeout` in playwright.config.ts
- Use `waitForLoadState('networkidle')` before assertions
- Add explicit waits: `await page.waitForTimeout(1000)`

---

## Related Documentation

- [react-vitest-testing.md](./react-vitest-testing.md) — React 19 + Vitest component testing setup
- [CLAUDE.md](../../CLAUDE.md) — Testing mandate and test locations
- [SPEC-010](../specs/spec-010-server-actions.md) — Controller testing patterns
- [Playwright Docs](https://playwright.dev/docs/intro)
- [Agent-Browser README](https://github.com/anthropics/agent-browser)
