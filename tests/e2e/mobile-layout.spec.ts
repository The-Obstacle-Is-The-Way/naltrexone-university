import { expect, type Page, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { ensureSubscribed } from './helpers/subscription';

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

const PUBLIC_PATHS = ['/', '/pricing', '/privacy', '/terms'];

// 375 is the project viewport QA-002 checks by hand; 360 is the narrowest
// common Android width. A page wider than the viewport scrolls sideways on a
// phone; wide content such as legal tables must scroll inside its own box.
const PHONE_WIDTHS = [375, 360];

async function expectNoSidewaysScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  // One load per path: resizing re-lays out the same page, and it avoids a
  // second networkidle wait, which Link prefetch can stretch past 20s.
  for (const viewportWidth of PHONE_WIDTHS) {
    await page.setViewportSize({ width: viewportWidth, height: 667 });
    const width = await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return {
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      };
    });

    expect(width.scroll, `${path} scrolls sideways at ${viewportWidth}px`).toBe(
      width.viewport,
    );
  }
}

// Runs only in the mobile-smoke project.
test.describe('phone-width layout', () => {
  test.setTimeout(180_000);

  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('public pages fit the viewport', { tag: '@mobile-smoke' }, async ({
      page,
    }) => {
      for (const path of PUBLIC_PATHS) {
        await expectNoSidewaysScroll(page, path);
      }
    });
  });

  test.describe('signed in', () => {
    test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

    test('subscriber and public pages fit the viewport', {
      tag: '@mobile-smoke',
    }, async ({ page }) => {
      await signInWithClerkPassword(page);
      await ensureSubscribed(page);

      for (const path of [
        '/app/dashboard',
        '/app/practice',
        '/app/practice/quick',
        '/app/history',
        '/app/bookmarks',
        '/app/billing',
        `/app/questions/${QUESTION_SLUG}`,
        ...PUBLIC_PATHS,
      ]) {
        await expectNoSidewaysScroll(page, path);
      }
    });
  });
});
