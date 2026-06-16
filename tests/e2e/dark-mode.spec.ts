import { expect, type Page, test } from '@playwright/test';

async function expectForcedDark(page: Page) {
  await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    )
    .toBe('dark');
}

test.describe('forced dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('ships dark tokens when OS prefers dark', async ({ page }) => {
    await page.goto('/');

    await expectForcedDark(page);

    await expect
      .poll(async () =>
        page.evaluate(() => document.body.classList.contains('bg-gray-50')),
      )
      .toBe(false);

    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector('.bg-gray-50') !== null),
      )
      .toBe(false);
  });

  test('keeps dark forced when OS preference changes to light', async ({
    page,
  }) => {
    await page.goto('/');

    await expectForcedDark(page);

    await page.emulateMedia({ colorScheme: 'light' });

    await expectForcedDark(page);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expectForcedDark(page);
  });
});
