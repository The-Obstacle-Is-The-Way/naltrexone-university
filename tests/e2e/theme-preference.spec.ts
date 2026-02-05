import { expect, test } from '@playwright/test';

test.describe('theme preference', () => {
  test.use({ colorScheme: 'light' });

  test('respects localStorage theme preference over OS default', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'dark');
    });

    await page.goto('/');

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          document.documentElement.classList.contains('dark'),
        );
      })
      .toBe(true);
  });
});
