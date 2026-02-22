import { expect, type Page } from '@playwright/test';

export type PracticeMode = 'tutor' | 'exam';

export async function startSession(
  page: Page,
  mode: PracticeMode = 'tutor',
  count = 1,
): Promise<void> {
  await page.goto('/app/practice');
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

  const startSessionButton = page.getByRole('button', {
    name: 'Start session',
  });
  const abandonButton = page.getByRole('button', { name: 'Abandon session' });

  // Practice page async-loads incomplete session state. Wait until either:
  // - the session starter is available ("Start session" button), or
  // - the continue-session card is available ("Abandon session" button).
  await startSessionButton.or(abandonButton).waitFor({ state: 'visible' });

  // If an incomplete session exists, abandon it first
  const abandonCount = await abandonButton.count();
  if (abandonCount > 0) {
    await abandonButton.click();
    // Confirm the abandon dialog
    await page.getByRole('button', { name: 'Abandon anyway' }).click();
    // Wait for the page to reload after abandoning
    await expect(startSessionButton).toBeVisible({ timeout: 10_000 });
  }

  // Mode: SegmentedControl with buttons (not a <select>).
  // Use { exact: true } to avoid matching "View breakdown for Tutor session..." buttons.
  await expect(
    page.getByRole('button', { name: 'Tutor', exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await page
    .getByRole('button', {
      name: mode === 'tutor' ? 'Tutor' : 'Exam',
      exact: true,
    })
    .click();

  // Count: label is "Questions" (not "Count")
  await page.getByLabel('Questions').fill(String(count));
  await startSessionButton.click();

  await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/, { timeout: 15_000 });
  // Session page heading is "Tutor Session" or "Exam Session"
  const headingName = mode === 'tutor' ? 'Tutor Session' : 'Exam Session';
  await expect(page.getByRole('heading', { name: headingName })).toBeVisible({
    timeout: 15_000,
  });

  // Wait for the first question to load. In dev mode, the getNextQuestion
  // server action may hit its 15s withTimeout on the first call due to
  // on-demand compilation, showing "Request timed out. Please try again."
  // Retry up to 2 times if this happens — the second call succeeds because
  // the compilation is cached.
  const answerChoices = page.getByRole('group', { name: 'Answer choices' });
  const tryAgainButton = page.getByRole('button', { name: 'Try again' });

  for (let attempt = 0; attempt < 3; attempt++) {
    await answerChoices.or(tryAgainButton).waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    if (await answerChoices.isVisible().catch(() => false)) {
      return; // Question loaded successfully
    }

    // "Request timed out" — click "Try again" to retry
    if (await tryAgainButton.isVisible().catch(() => false)) {
      await tryAgainButton.click();
    }
  }

  // Final check — if still no answer choices after retries, fail explicitly
  await expect(answerChoices).toBeVisible({ timeout: 60_000 });
}
