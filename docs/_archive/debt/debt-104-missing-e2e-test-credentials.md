# DEBT-104: Missing E2E Test Credentials for Authenticated Flows

**Status:** Accepted
**Priority:** P1
**Date:** 2026-02-05
**Updated:** 2026-02-06

> **Accepted justification:** All code and infrastructure work is complete. Remaining items (CI secret values, Clerk dashboard policy verification) are external manual tasks that cannot be resolved via code.

---

## Description

Authenticated Playwright coverage depends on Clerk credentials:

- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`

Without those, critical flows are skipped (practice, review, bookmarks, dashboard, billing).

---

## Progress (2026-02-05)

### Completed

1. **Environment + docs plumbing**
   - Added `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` placeholders to `.env.example`.

2. **Clerk Playwright setup**
   - Added `tests/e2e/global.setup.ts` using `clerkSetup()`.
   - Updated `playwright.config.ts` to add setup project dependency for Chromium runs.

3. **Programmatic auth helper**
   - Added `tests/e2e/helpers/clerk-auth.ts` using `clerk.signIn()` with password strategy.
   - Removed brittle UI text selectors from authenticated specs.

4. **Subscription/bootstrap helper**
   - Added `tests/e2e/helpers/subscription.ts` with `ensureSubscribed()` so tests can self-provision subscription state.

5. **Spec migrations**
   - Updated authenticated E2E specs to use the new auth/subscription helpers.

### Remaining (manual/external)

1. **Secret values (external)**
   - CI workflow already references `E2E_CLERK_USER_USERNAME` / `E2E_CLERK_USER_PASSWORD`.
   - Repository/Vercel secret values must be set and maintained externally.

2. **Clerk dashboard policy verification (external)**
   - Confirm password sign-in strategy remains enabled for the environment used by E2E.
   - Confirm the dedicated E2E user remains valid and not blocked by additional auth constraints.

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
import { signInWithClerkPassword } from '@/tests/e2e/helpers/clerk-auth';

test('authenticated flow', async ({ page }) => {
  await signInWithClerkPassword(page);
  await page.goto('/app/practice');
  // ... test continues
});
```

---

## Resolution Checklist

- [x] Credentials placeholders documented in `.env.example`
- [x] E2E tests refactored to use `clerk.signIn()` helper
- [x] Global setup file created (`tests/e2e/global.setup.ts`)
- [x] Playwright config updated for Clerk setup dependency
- [x] Subscription bootstrap helper added for authenticated flows
- [ ] CI/CD secret values configured
- [ ] Production/preview Clerk password policy verified

---

## Related

- **DEBT-107:** Question Engine E2E Completeness (depends on this)
- `tests/e2e/helpers/clerk-auth.ts`
- `tests/e2e/global.setup.ts`
- `playwright.config.ts`
- [Clerk Testing Docs](https://clerk.com/docs/guides/development/testing/playwright/overview)
- [Clerk Test Helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)
