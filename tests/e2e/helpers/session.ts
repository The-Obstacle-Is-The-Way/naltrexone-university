import { expect, type Page } from '@playwright/test';

export type PracticeMode = 'tutor' | 'exam';

export async function startSession(
  page: Page,
  mode: PracticeMode = 'tutor',
  count = 1,
): Promise<void> {
  await page.goto('/app/practice');
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

  // If an incomplete session exists, abandon it first
  const abandonButton = page.getByRole('button', { name: 'Abandon session' });
  const abandonCount = await abandonButton.count();
  if (abandonCount > 0) {
    await abandonButton.click();
    // Confirm the abandon dialog
    await page.getByRole('button', { name: 'Abandon anyway' }).click();
    // Wait for the page to reload after abandoning
    await expect(
      page.getByRole('button', { name: 'Start session' }),
    ).toBeVisible({ timeout: 10_000 });
  }

  // Mode: SegmentedControl with buttons (not a <select>).
  // Use { exact: true } to avoid matching "View breakdown for Tutor session..." buttons.
  await page
    .getByRole('button', {
      name: mode === 'tutor' ? 'Tutor' : 'Exam',
      exact: true,
    })
    .click();

  // Count: label is "Questions" (not "Count")
  await page.getByLabel('Questions').fill(String(count));
  await page.getByRole('button', { name: 'Start session' }).click();

  await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/, { timeout: 15_000 });
  // Session page heading is "Tutor Session" or "Exam Session"
  const headingName = mode === 'tutor' ? 'Tutor Session' : 'Exam Session';
  await expect(page.getByRole('heading', { name: headingName })).toBeVisible({
    timeout: 15_000,
  });
}
