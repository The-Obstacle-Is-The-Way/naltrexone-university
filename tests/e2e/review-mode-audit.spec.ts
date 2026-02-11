import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  assertQuestionSlugExists,
  selectChoiceByLabel,
  submitQuestionForOutcome,
} from './helpers/question';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

test.describe('review mode gap audit', () => {
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('question page always shows blank form regardless of entry point', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    // Step 1: Create a known incorrect attempt so the question appears in history
    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Incorrect');

    // ---------------------------------------------------------------
    // AUDIT 1: Dashboard → Recent Activity → Question Page
    // ---------------------------------------------------------------
    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();

    // Find the question link in Recent Activity
    const dashboardLink = page.locator(`a[href*="${QUESTION_SLUG}"]`).first();
    await expect(dashboardLink).toBeVisible({ timeout: 15_000 });
    await dashboardLink.click();

    // Verify we landed on the question page
    await expect(page).toHaveURL(
      new RegExp(`/app/questions/${QUESTION_SLUG}\\?from=dashboard`),
      { timeout: 15_000 },
    );

    // AUDIT ASSERTION: Subtitle says "Review" but form is blank
    await expect(
      page.getByText('Review a question from your recent activity.'),
    ).toBeVisible();

    // AUDIT ASSERTION: Submit button visible (means blank attempt mode, not review)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible({
      timeout: 15_000,
    });

    // AUDIT ASSERTION: No Feedback component rendered on load
    // Feedback component renders role="alert" containing "Correct" or "Incorrect" badge
    // (Other role="alert" elements like page title announcements may exist)
    const feedbackAlert = page.locator('[role="alert"]').filter({
      hasText: /^(Correct|Incorrect)/,
    });
    await expect(feedbackAlert).toHaveCount(0);

    // AUDIT ASSERTION: No choice is pre-selected (all radio buttons unchecked)
    // Wait for choices to load (the question page fetches asynchronously)
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.locator('input[type="radio"]').first()).toBeVisible({
      timeout: 15_000,
    });
    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    expect(radioCount).toBeGreaterThan(0);
    for (let i = 0; i < radioCount; i++) {
      await expect(radios.nth(i)).not.toBeChecked();
    }

    // ---------------------------------------------------------------
    // AUDIT 2: History → Questions tab → "Reattempt"/"Review" button
    // ---------------------------------------------------------------
    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Find any question link in the Questions tab
    const historyLink = page
      .locator(`a[href*="${QUESTION_SLUG}"][href*="from=history"]`)
      .first();
    await expect(historyLink).toBeVisible({ timeout: 15_000 });
    await historyLink.click();

    // Verify we landed on the question page from history
    await expect(page).toHaveURL(
      new RegExp(`/app/questions/${QUESTION_SLUG}\\?from=history`),
      { timeout: 15_000 },
    );

    // AUDIT ASSERTION: Subtitle says "Reviewing" but form is blank
    await expect(
      page.getByText('Reviewing a question from your history.'),
    ).toBeVisible();

    // AUDIT ASSERTION: Submit button visible (blank attempt mode)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible({
      timeout: 15_000,
    });

    // AUDIT ASSERTION: No Feedback component on load
    const historyFeedbackAlert = page.locator('[role="alert"]').filter({
      hasText: /^(Correct|Incorrect)/,
    });
    await expect(historyFeedbackAlert).toHaveCount(0);

    // AUDIT ASSERTION: No choice pre-selected
    const historyRadios = page.locator('input[type="radio"]');
    const historyRadioCount = await historyRadios.count();
    for (let i = 0; i < historyRadioCount; i++) {
      await expect(historyRadios.nth(i)).not.toBeChecked();
    }
  });

  test('session breakdown links to blank question page', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Start a 1-question tutor session and complete it
    await startSession(page, 'tutor', 1);
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });

    // End the session
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to History Sessions tab
    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Click "View breakdown" on the first session
    const viewBreakdownButton = page
      .getByRole('button', { name: /View breakdown/ })
      .first();
    await expect(viewBreakdownButton).toBeVisible({ timeout: 15_000 });
    await viewBreakdownButton.click();

    // Wait for breakdown to expand — look for a question link
    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 10_000 });

    // Capture the outcome badge (Correct or Incorrect) next to the question
    const correctBadge = page.locator('text=Correct').first();
    const incorrectBadge = page.locator('text=Incorrect').first();
    const hasBadge =
      (await correctBadge.isVisible().catch(() => false)) ||
      (await incorrectBadge.isVisible().catch(() => false));
    expect(hasBadge).toBe(true);

    // Click the question from the breakdown
    await breakdownLink.click();
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });

    // AUDIT ASSERTION: Submit button visible (blank form, not review mode)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible({
      timeout: 15_000,
    });

    // AUDIT ASSERTION: No Feedback component rendered
    const breakdownFeedbackAlert = page.locator('[role="alert"]').filter({
      hasText: /^(Correct|Incorrect)/,
    });
    await expect(breakdownFeedbackAlert).toHaveCount(0);

    // AUDIT ASSERTION: No choice pre-selected
    const radios = page.locator('input[type="radio"]');
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      await expect(radios.nth(i)).not.toBeChecked();
    }
  });

  test('post-submit feedback component renders correctly', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    // Navigate to question and submit an answer
    await page.goto(`/app/questions/${QUESTION_SLUG}`);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    // AUDIT ASSERTION: Feedback component appears after submit
    // Feedback has role="alert" and contains "Correct" or "Incorrect" badge
    const feedbackCard = page.locator('[role="alert"]').filter({
      hasText: /^(Correct|Incorrect)/,
    });
    await expect(feedbackCard).toBeVisible({ timeout: 10_000 });

    // AUDIT ASSERTION: Feedback shows Correct or Incorrect badge
    await expect(
      feedbackCard.getByText(/^(Correct|Incorrect)$/).first(),
    ).toBeVisible();

    // AUDIT ASSERTION: Explanation section present
    await expect(
      feedbackCard.getByText('Explanation', { exact: true }),
    ).toBeVisible();

    // AUDIT ASSERTION: Submit button is gone, replaced by Try Again
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

    // AUDIT ASSERTION: At least one choice has visual correctness state
    // After submit, the correct choice gets border-success class
    const correctChoice = page.locator('label.border-success');
    await expect(correctChoice.first()).toBeVisible();

    // AUDIT ASSERTION: Choices are locked (radio buttons disabled)
    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    expect(radioCount).toBeGreaterThan(0);
    for (let i = 0; i < radioCount; i++) {
      await expect(radios.nth(i)).toBeDisabled();
    }
  });

  test('review and reattempt buttons in history produce identical URLs', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    // Create both a correct and incorrect attempt
    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Incorrect');

    // Navigate to History Questions tab
    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Collect all question action links (Review or Reattempt buttons)
    const actionLinks = page.locator(
      'a[aria-label^="Review question:"], a[aria-label^="Reattempt question:"]',
    );
    const linkCount = await actionLinks.count();
    expect(linkCount).toBeGreaterThan(0);

    // AUDIT ASSERTION: All links use ?from=history — no mode param, no attempt ID
    for (let i = 0; i < linkCount; i++) {
      const href = await actionLinks.nth(i).getAttribute('href');
      expect(href).toContain('from=history');
      expect(href).not.toContain('mode=');
      expect(href).not.toContain('attemptId=');
    }
  });
});
