import { expect, type Page, type Response } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { test } from './helpers/clerk-auth-test';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

const FOREIGN_SCRIPT = 'https://csp-control.example.test/control.js';
const LOCAL_REPORT_PATH = '/api/__e2e-csp__/security/';

// Defense in depth for all cases, installed before any navigation. The
// positive control also replaces reporting destinations: Reporting API
// delivery may be buffered outside page.route's lifetime.
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/[^/]+\/security\//, (route) =>
    route.fulfill({ status: 204 }),
  );
});

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

async function loadForeignScript(page: Page): Promise<void> {
  await page.route(FOREIGN_SCRIPT, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'void 0;' }),
  );
  await page.evaluate(
    (src) =>
      new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error('Control script failed to load'));
        document.head.appendChild(script);
      }),
    FOREIGN_SCRIPT,
  );
}

test.describe('content security policy, signed out', () => {
  test('the observer detects a foreign script and its intercepted local report', async ({
    page,
  }) => {
    const violations = await recordCspViolations(page);
    const reportedBlockedUris: string[] = [];
    await page.route(`**${LOCAL_REPORT_PATH}`, async (route) => {
      const report = route.request().postDataJSON();
      reportedBlockedUris.push(report['csp-report']['blocked-uri']);
      await route.fulfill({ status: 204 });
    });
    await page.route('**/pricing', async (route) => {
      const response = await route.fetch();
      const headers = response.headers();
      const policy = headers['content-security-policy-report-only'];
      expect(policy).toContain("script-src 'self'");
      if (!policy) throw new Error('The control document has no CSP');
      // Keep every source directive. Only this control's delivery is changed
      // to immediate, intercepted legacy reporting; no destination is Sentry.
      headers['content-security-policy-report-only'] = policy
        .split('; ')
        .filter((part) => !/^report-(?:uri|to)\b/.test(part))
        .concat(
          `report-uri ${new URL(LOCAL_REPORT_PATH, route.request().url())}`,
        )
        .join('; ');
      delete headers['reporting-endpoints'];
      delete headers['report-to'];
      await route.fulfill({ response, headers });
    });

    expectReportOnlyPolicy(await page.goto('/pricing'));
    await waitForClerk(page);
    expect(violations).toEqual([]);
    await loadForeignScript(page);

    await expect
      .poll(() => violations)
      .toContain(`script-src-elem ${FOREIGN_SCRIPT}`);
    await expect.poll(() => reportedBlockedUris).toContain(FOREIGN_SCRIPT);
  });

  test('a sensitive document withholds reporting and its same-origin referrer', async ({
    page,
  }) => {
    // A public page isolates the native-browser boundary from checkout's
    // authentication and Stripe sync, which have their own provider contracts.
    const response = await page.goto('/pricing?session_id=synthetic');
    await expect(page).toHaveURL((url) => url.searchParams.has('session_id'));
    expectReportOnlyPolicy(response);
    const headers = response?.headers();
    expect(headers?.['content-security-policy-report-only']).not.toMatch(
      /report-(?:uri|to)\b/,
    );
    expect(headers?.['reporting-endpoints']).toBeUndefined();
    expect(headers?.['referrer-policy']).toBe('no-referrer');
    await waitForClerk(page);
    await loadForeignScript(page);

    // A document navigation (not the router) obtains a fresh policy. The
    // request and resulting document must both have an empty referrer.
    const nextDocument = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        new URL(request.url()).pathname === '/',
    );
    await page.evaluate(() => window.location.assign('/'));
    const request = await nextDocument;
    expect(await request.headerValue('referer')).toBeNull();
    await expect(page).toHaveURL((url) => url.pathname === '/' && !url.search);
    await waitForClerk(page);
    expect(await page.evaluate(() => document.referrer)).toBe('');
  });

  // A router request for a protected page, answered signed out, is redirected
  // to sign-in. On Clerk's Account Portal, another origin, the redirect was a
  // fetch the policy's `connect-src` does not list.
  test('a signed-out router request for a protected page stays on the site', async ({
    page,
  }) => {
    const violations = await recordCspViolations(page);
    expectReportOnlyPolicy(await page.goto('/'));
    await waitForClerk(page);

    // The headers Next.js's router sends on a prefetch.
    const landedOn = await page.evaluate(() =>
      fetch('/app/dashboard', {
        headers: { rsc: '1', 'next-router-prefetch': '1', 'next-url': '/' },
      }).then(
        (response) => new URL(response.url).pathname,
        (error: unknown) => `fetch failed: ${String(error)}`,
      ),
    );

    expect(landedOn).toBe('/sign-in');
    expect(violations).toEqual([]);
  });

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
