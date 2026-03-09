import { expect, type Page } from '@playwright/test';
import { parseQuestionProgressCount } from './question-progress';

export type PracticeMode = 'tutor' | 'exam';

async function verifyRequestedSessionCount(
  page: Page,
  requestedCount: number,
): Promise<void> {
  const progressIndicator = page.getByText(/^Question 1 of \d+\b/);
  await expect(progressIndicator).toBeVisible({ timeout: 15_000 });

  const progressText = (await progressIndicator.textContent())?.trim() ?? '';
  const actualCount = parseQuestionProgressCount(progressText);
  if (actualCount !== requestedCount) {
    throw new Error(
      `startSession created ${actualCount}-question session but ${requestedCount} were requested`,
    );
  }
}

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
  const selectedModeButton = page.getByRole('button', {
    name: mode === 'tutor' ? 'Tutor' : 'Exam',
    exact: true,
  });
  await selectedModeButton.click();
  await expect(selectedModeButton).toHaveAttribute('aria-pressed', 'true', {
    timeout: 10_000,
  });

  // Status options do not include "All". To avoid brittle failures when the shared
  // E2E user has exhausted "Unanswered", probe the supported statuses and pick the
  // first one that enables "Start session" for the requested count.
  const supportedStatuses = ['Unanswered', 'Incorrect', 'Bookmarked'] as const;
  let selectedStatus: (typeof supportedStatuses)[number] | null = null;
  let lastProbeError: unknown = null;

  for (const statusLabel of supportedStatuses) {
    const statusButton = page.getByRole('button', {
      name: statusLabel,
      exact: true,
    });
    await statusButton.click();
    await expect(statusButton).toHaveAttribute('aria-pressed', 'true', {
      timeout: 10_000,
    });

    // Count: label is "Questions" (not "Count")
    await page.getByLabel('Questions').fill(String(count));

    try {
      await expect(startSessionButton).toBeEnabled({ timeout: 3_000 });
      selectedStatus = statusLabel;
      break;
    } catch (error) {
      // Try the next supported status.
      lastProbeError = error;
    }
  }

  if (!selectedStatus) {
    throw new Error(
      `Could not enable Start session after trying statuses: ${supportedStatuses.join(
        ', ',
      )}`,
      { cause: lastProbeError ?? undefined },
    );
  }

  await startSessionButton.click();

  await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/, { timeout: 15_000 });
  const expectedHeadingName =
    mode === 'tutor' ? 'Tutor Session' : 'Exam Session';
  await page
    .getByRole('heading', { name: expectedHeadingName })
    .waitFor({ state: 'visible', timeout: 15_000 });

  // Wait for the first question to load. In dev mode, the getNextQuestion
  // server action may hit its 15s withTimeout on the first call due to
  // on-demand compilation, showing "Request timed out. Please try again."
  // Most runs recover on the next call after compilation is cached, but we
  // keep one extra retry to absorb occasional cold-start variance in CI/local.
  const answerChoices = page.getByRole('group', { name: 'Answer choices' });
  const tryAgainButton = page.getByRole('button', { name: 'Try again' });
  const maxLoadAttempts = 3;

  for (let attempt = 1; attempt <= maxLoadAttempts; attempt++) {
    await answerChoices.or(tryAgainButton).waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    if (await answerChoices.isVisible().catch(() => false)) {
      await verifyRequestedSessionCount(page, count);
      return; // Question loaded successfully
    }

    // "Request timed out" — click "Try again" while attempts remain.
    if (
      attempt < maxLoadAttempts &&
      (await tryAgainButton.isVisible().catch(() => false))
    ) {
      await tryAgainButton.click();
    }
  }

  // Final check — if still no answer choices after retries, fail explicitly
  await expect(answerChoices).toBeVisible({ timeout: 60_000 });
}
