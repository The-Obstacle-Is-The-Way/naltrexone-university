import { expect, type Page } from '@playwright/test';

export type PracticeMode = 'tutor' | 'exam';

export async function startSession(
  page: Page,
  mode: PracticeMode = 'tutor',
  count = 1,
): Promise<void> {
  await page.goto('/app/practice');
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

  await page.getByLabel('Mode').selectOption(mode);
  await page.getByLabel('Count').fill(String(count));
  await page.getByRole('button', { name: 'Start session' }).click();

  await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText(new RegExp(`Session: ${mode}`, 'i'))).toBeVisible(
    {
      timeout: 15_000,
    },
  );
}
