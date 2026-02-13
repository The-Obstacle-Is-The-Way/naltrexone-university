import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.describe('session review navigation (SPEC-027)', () => {
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('Session Summary → sequential review with prev/next navigation', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Create a tutor session with 2 questions
    await startSession(page, 'tutor', 2);

    // Answer question 1: select choice + submit + next
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Next question' }).click();

    // Answer question 2: select choice + submit
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });

    // End session
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 15_000 });

    // Extract sessionId from URL: /app/practice/{sessionId}
    const sessionUrl = page.url();
    const sessionIdMatch = sessionUrl.match(/\/app\/practice\/([^/?]+)/);
    expect(sessionIdMatch).toBeTruthy();
    const sessionId = sessionIdMatch?.[1];

    // Wait for breakdown links to load
    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 15_000 });

    // Click first question link from breakdown
    await breakdownLink.click();

    // Verify URL contains sessionId, from=practice, mode=review
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/sessionId=/);
    await expect(page).toHaveURL(/from=practice/);
    await expect(page).toHaveURL(/mode=review/);

    // Wait for question content to load
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // Verify back link goes to /app/practice/{sessionId} with label "Back to Session"
    const backLink = page.locator(`a[href*="/app/practice/${sessionId}"]`);
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toContainText('Back to Session');

    // Verify "Next →" link is present (we're on question 1)
    const nextLink = page.getByText('Next →');
    await expect(nextLink).toBeVisible({ timeout: 15_000 });

    // Verify position indicator "Question 1 of 2"
    await expect(page.getByText('Question 1 of 2')).toBeVisible({
      timeout: 15_000,
    });

    // Click "Next →"
    await nextLink.click();

    // Wait for navigation
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // Verify "← Previous" link is present on question 2
    await expect(page.getByText('← Previous')).toBeVisible({
      timeout: 15_000,
    });

    // Verify position indicator "Question 2 of 2"
    await expect(page.getByText('Question 2 of 2')).toBeVisible({
      timeout: 15_000,
    });

    // Verify no "Next →" link on last question
    await expect(page.getByText('Next →')).toHaveCount(0);
  });

  test('History → Session Review carries sessionId context', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Navigate to History → Sessions tab
    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Click "View breakdown" on a session row
    const viewBreakdownButton = page
      .getByRole('button', { name: /View breakdown/i })
      .first();
    await expect(viewBreakdownButton).toBeVisible({ timeout: 15_000 });
    await viewBreakdownButton.click();

    // Wait for breakdown question links to appear
    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 15_000 });

    // Click first question link from the breakdown
    await breakdownLink.click();

    // Verify URL contains sessionId, from=history, mode=review
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/sessionId=/);
    await expect(page).toHaveURL(/from=history/);
    await expect(page).toHaveURL(/mode=review/);

    // Wait for question content to load
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // Verify back link goes to /app/history (sessions tab)
    const backLink = page.locator('a[href*="/app/history"]');
    await expect(backLink.first()).toBeVisible({ timeout: 15_000 });
  });

  test('Non-session question flows have no session navigation', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Navigate to History → Questions tab
    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Find a question link (from questions tab, not session-scoped)
    const questionLink = page.locator('a[href*="/app/questions/"]').first();

    // Skip if no attempted questions exist
    const linkCount = await questionLink.count();
    if (linkCount === 0) {
      test.skip(true, 'No attempted questions in history to verify');
      return;
    }

    await expect(questionLink).toBeVisible({ timeout: 15_000 });

    // Verify the link does NOT contain sessionId
    const href = await questionLink.getAttribute('href');
    expect(href).not.toContain('sessionId=');

    // Click to navigate to the question
    await questionLink.click();

    // Verify URL does NOT contain sessionId
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    expect(page.url()).not.toContain('sessionId=');

    // Wait for question content to load
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // Verify no session navigation elements are present
    await expect(page.getByText('← Previous')).toHaveCount(0);
    await expect(page.getByText('Next →')).toHaveCount(0);
    await expect(page.getByText(/Question \d+ of \d+/)).toHaveCount(0);
  });
});
