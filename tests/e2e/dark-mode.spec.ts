import { expect, test } from '@playwright/test';

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('applies the `.dark` class when OS prefers dark', async ({ page }) => {
    await page.goto('/');

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          document.documentElement.classList.contains('dark'),
        );
      })
      .toBe(true);

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
});
