import { expect, type Page, type Response } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { test } from './helpers/clerk-auth-test';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

// BUG-378: the report-only policy must admit every script a page loads. A
// violation never blocks anything, but each one sends Sentry a report that
// counts against its error quota, which the operational alerts share.

declare global {
  interface Window {
    __e2eCspViolation?: (violation: string) => void;
  }
}

async function recordCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__e2eCspViolation', (violation: string) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__e2eCspViolation?.(
        `${event.effectiveDirective} ${event.blockedURI}`,
      );
    });
  });
  return violations;
}

// A page without the policy would report nothing and pass, so each test first
// checks that the policy is there.
function expectReportOnlyPolicy(response: Response | null): void {
  expect(response?.headers()['content-security-policy-report-only']).toContain(
    "script-src 'self'",
  );
}

// Clerk JS and its UI bundle load after the page, from Clerk's Frontend API.
async function waitForClerk(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Reflect.get(window, 'Clerk')?.loaded === true,
  );
}

test.describe('content security policy, signed out', () => {
  for (const path of ['/', '/pricing', '/sign-in', '/sign-up']) {
    test(`${path} loads every script the policy admits`, async ({ page }) => {
      const violations = await recordCspViolations(page);

      const response = await page.goto(path);
      // A redirect would test another page under this one's name.
      await expect(page).toHaveURL((url) => url.pathname === path);
      expectReportOnlyPolicy(response);
      await waitForClerk(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe('content security policy, signed in', () => {
  test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('the dashboard loads every script the policy admits', async ({
    page,
  }) => {
    const violations = await recordCspViolations(page);

    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    expectReportOnlyPolicy(await page.goto('/app/dashboard'));
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await waitForClerk(page);

    expect(violations).toEqual([]);
  });
});
