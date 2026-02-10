import { expect, type Page } from '@playwright/test';

export async function ensureSubscribed(page: Page): Promise<void> {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
  await expect(page.getByText("You're already subscribed")).toBeVisible({
    timeout: 15_000,
  });
}
