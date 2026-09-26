import { expect, type Page, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

// Runs only in the mobile-smoke project (375×667). A page wider than the
// viewport scrolls sideways on a phone, the layout break QA-002 checks by
// hand; wide content such as legal tables must scroll inside its own box.
async function expectNoSidewaysScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));

  expect(width.scroll, `${path} scrolls sideways at phone width`).toBe(
    width.viewport,
  );
}

test.describe('phone-width layout', () => {
  test.setTimeout(120_000);

  test('public pages fit the viewport', { tag: '@mobile-smoke' }, async ({
    page,
  }) => {
    for (const path of ['/', '/pricing', '/privacy', '/terms']) {
      await expectNoSidewaysScroll(page, path);
    }
  });

  test('subscriber pages fit the viewport', { tag: '@mobile-smoke' }, async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    for (const path of [
      '/app/dashboard',
      '/app/practice',
      '/app/history',
      '/app/bookmarks',
      '/app/billing',
      `/app/questions/${QUESTION_SLUG}`,
    ]) {
      await expectNoSidewaysScroll(page, path);
    }
  });
});
