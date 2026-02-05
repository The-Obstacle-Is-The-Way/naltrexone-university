# DEBT-104: Missing E2E Test Credentials for Authenticated Flows

**Status:** In Progress
**Priority:** P1
**Date:** 2026-02-05
**Updated:** 2026-02-05

---

## Description

E2E tests for authenticated flows (practice, dashboard, billing, etc.) are skipped because the required environment variables are not configured:

- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`

This means critical user flows cannot be automatically tested:
- Practice question answering
- Session creation
- Dashboard stats display
- Billing management
- Bookmark/review functionality

---

## Progress (2026-02-05)

### What's Done

1. **Clerk Development Instance Configured:**
   - "Sign-up with password" enabled (required for E2E testing)
   - "Add password to account" enabled
   - "Client Trust" disabled (was blocking `clerk.signIn()` helper)

2. **E2E Test User Created:**
   - Email: `e2e-test@addictionboards.com`
   - Created in Clerk Development instance

3. **Credentials Added to `.env.local`:**

   ```text
   E2E_CLERK_USER_USERNAME="e2e-test@addictionboards.com"
   E2E_CLERK_USER_PASSWORD="<set locally>"
   ```

4. **`@clerk/testing` Package Installed:**
   - Provides `clerk.signIn()` helper for programmatic sign-in
   - Provides `clerkSetup()` for testing tokens
   - Bypasses manual UI interaction

### What's Remaining

1. **E2E Test User Needs Subscription:**
   - Currently the user has no Stripe subscription
   - Tests that require subscription will fail or need to handle checkout
   - **Action needed:** Manually subscribe the E2E user via the app
   - Note: This was previously blocked by a Stripe SDK `this`-binding bug (fixed in BUG-069 / BUG-070).

2. **Update E2E Tests to Use `@clerk/testing`:**
   - Current tests use manual UI interaction (fill email, click Continue, etc.)
   - Should refactor to use `clerk.signIn()` helper
   - This is cleaner and more reliable

3. **Add Global Setup for Clerk Testing Tokens:**
   - Create `tests/e2e/global.setup.ts` with `clerkSetup()`
   - Update `playwright.config.ts` to run setup before tests

4. **CI/CD Configuration:**
   - Add `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` as GitHub secrets
   - Ensure Production Clerk instance also has password auth enabled if running E2E in prod

---

## Clerk Configuration Requirements

For E2E testing with `@clerk/testing`, these Clerk settings are **required**:

| Setting | Location | Required Value |
|---------|----------|----------------|
| Sign-up with password | Configure → Password | ON |
| Add password to account | Configure → Password | ON |
| Client Trust | Configure → Password | OFF (blocks 2FA in tests) |

**Note:** The `clerk.signIn()` helper does NOT support multi-factor authentication.

---

## Official Clerk E2E Testing Pattern

### 1. Install Package

```bash
pnpm add -D @clerk/testing
```

### 2. Global Setup (`tests/e2e/global.setup.ts`)

```typescript
import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

setup.describe.configure({ mode: 'serial' });

setup('global clerk setup', async () => {
  await clerkSetup();
});
```

### 3. Playwright Config

```typescript
projects: [
  { name: 'setup', testMatch: /global\.setup\.ts/ },
  { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
],
```

### 4. Test Usage

```typescript
import { clerk } from '@clerk/testing/playwright';

test('authenticated flow', async ({ page }) => {
  await page.goto('/');

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_USER_USERNAME!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });

  await page.goto('/app/practice');
  // ... test continues
});
```

---

## Resolution Checklist

- [x] Test user created in Clerk dashboard
- [x] Password authentication enabled in Clerk
- [x] Client Trust disabled in Clerk
- [x] Credentials added to `.env.local`
- [x] `@clerk/testing` package installed
- [ ] Test user has active subscription
- [ ] E2E tests refactored to use `clerk.signIn()` helper
- [ ] Global setup file created
- [ ] Playwright config updated for Clerk setup
- [ ] `pnpm test:e2e` runs all tests (none skipped)
- [ ] CI/CD secrets configured

---

## Related

- **DEBT-107:** Question Engine E2E Completeness (depends on this)
- `tests/e2e/practice.spec.ts` - practice E2E test
- `tests/e2e/subscribe-and-practice.spec.ts` - subscription flow test
- [Clerk Testing Docs](https://clerk.com/docs/guides/development/testing/playwright/overview)
- [Clerk Test Helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)
