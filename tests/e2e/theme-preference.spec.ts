import { expect, test } from '@playwright/test';

test.describe('theme preference', () => {
  test.use({ colorScheme: 'light' });

  test('forces dark over a stale light localStorage preference and OS light', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('theme', 'light');
    });

    await page.goto('/');

    await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).colorScheme,
        ),
      )
      .toBe('dark');
  });
});
