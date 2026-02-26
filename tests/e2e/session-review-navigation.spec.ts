import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { escapeRegexLiteral, selectChoiceByLabel } from './helpers/question';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.describe('session review navigation (SPEC-027)', () => {
  // Multi-page audit flows can exceed the default timeout due to sequential navigation and assertions in CI.
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
    await page.getByRole('button', { name: 'Next →' }).click();

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
    await page.waitForURL(/\/app\/practice\/[^/?]+$/, { timeout: 15_000 });
    const sessionUrl = page.url();
    const sessionIdMatch = sessionUrl.match(/\/app\/practice\/([^/?]+)/);
    expect(sessionIdMatch).toBeTruthy();
    const sessionId = sessionIdMatch?.[1];

    // Wait for breakdown links to load
    const breakdownLinks = page.locator('a[href*="/app/questions/"]');
    await expect(breakdownLinks.first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => breakdownLinks.count(), {
        timeout: 15_000,
        message:
          '[E2E_BASELINE_MISSING] Expected at least two reviewable session breakdown links.',
      })
      .toBeGreaterThanOrEqual(2);

    // Click first question link from breakdown
    const breakdownLink = breakdownLinks.first();
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

    // SPEC-028: ReviewQuestionNavigator grid
    const navigatorCard = page.locator('[data-slot="card"]', {
      hasText: 'Question navigator',
    });
    const navigatorHeading = page.getByText('Question navigator');
    await expect(navigatorHeading).toBeVisible({ timeout: 15_000 });

    const navigatorButtons = navigatorCard.locator('[data-slot="button"]');
    await expect(navigatorButtons).toHaveCount(2, { timeout: 15_000 });

    await expect(
      navigatorCard.locator(
        '[data-slot="button"][aria-label*=": Correct"], [data-slot="button"][aria-label*=": Incorrect"]',
      ),
    ).toHaveCount(2, { timeout: 15_000 });

    const currentNavigatorButton = navigatorCard.locator(
      '[aria-current="step"]',
    );
    await expect(currentNavigatorButton).toBeVisible({ timeout: 15_000 });
    const navigatorCurrentTextOnFirstQuestion =
      await currentNavigatorButton.textContent();
    expect(navigatorCurrentTextOnFirstQuestion).not.toBeNull();

    // Verify back link goes to /app/practice/{sessionId} with label "Back to Session"
    const backLink = page
      .getByRole('link', { name: 'Back to Session' })
      .first();
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    const escapedSessionId = escapeRegexLiteral(sessionId ?? '');
    await expect(backLink).toHaveAttribute(
      'href',
      new RegExp(`/app/practice/${escapedSessionId}`),
    );

    // Verify "Next →" link is present (we're on question 1)
    const nextLink = page.getByText('Next →');
    await expect(nextLink).toBeVisible({ timeout: 15_000 });

    // Verify position indicator "Question 1 of 2"
    await expect(page.getByText('Question 1 of 2')).toBeVisible({
      timeout: 15_000,
    });

    // Click "Next →"
    const urlBeforeNext = page.url();
    await nextLink.click();

    // Wait for navigation
    await page.waitForURL(
      (url) =>
        url.toString() !== urlBeforeNext &&
        url.pathname.startsWith('/app/questions/') &&
        url.searchParams.get('sessionId') === sessionId &&
        url.searchParams.get('from') === 'practice' &&
        url.searchParams.get('mode') === 'review',
      { timeout: 15_000 },
    );
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

    // Current contract keeps "Next →" visible but disabled on the last question.
    const nextButtonOnLast = page.getByRole('button', { name: 'Next →' });
    await expect(nextButtonOnLast).toBeVisible({ timeout: 15_000 });
    await expect(nextButtonOnLast).toBeDisabled({ timeout: 15_000 });

    // SPEC-028: jump navigation via ReviewQuestionNavigator
    const navigatorCurrentTextOnSecondQuestion = await navigatorCard
      .locator('[aria-current="step"]')
      .textContent();
    expect(navigatorCurrentTextOnSecondQuestion).not.toBeNull();
    expect(navigatorCurrentTextOnSecondQuestion?.trim()).not.toBe(
      navigatorCurrentTextOnFirstQuestion?.trim(),
    );

    const nonCurrentNavigatorButton = navigatorCard
      .locator('[data-slot="button"]:not([aria-current="step"])')
      .first();
    const pathnameBeforeJump = new URL(page.url()).pathname;
    await nonCurrentNavigatorButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname !== pathnameBeforeJump &&
        url.pathname.startsWith('/app/questions/') &&
        url.searchParams.get('sessionId') === sessionId &&
        url.searchParams.get('from') === 'practice' &&
        url.searchParams.get('mode') === 'review',
      { timeout: 15_000 },
    );
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });
    await expect(page.getByText('Question navigator')).toBeVisible({
      timeout: 15_000,
    });

    const navigatorCurrentTextAfterJump = await navigatorCard
      .locator('[aria-current="step"]')
      .textContent();
    expect(navigatorCurrentTextAfterJump).not.toBeNull();
    expect(navigatorCurrentTextAfterJump?.trim()).toBe(
      navigatorCurrentTextOnFirstQuestion?.trim(),
    );

    await expect(page.getByText('Question 1 of 2')).toBeVisible({
      timeout: 15_000,
    });
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
    const emptySessionsMessage = page.getByText(
      /No (completed )?sessions yet/i,
    );
    await viewBreakdownButton.or(emptySessionsMessage).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    const hasNoCompletedSessions = await emptySessionsMessage
      .isVisible()
      .catch(() => false);
    expect(
      hasNoCompletedSessions,
      '[E2E_BASELINE_MISSING] Expected at least one completed history session.',
    ).toBe(false);
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

    // Verify back link uses the canonical sessions history href (tab + pagination)
    const backLink = page
      .getByRole('link', { name: 'Back to History' })
      .first();
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toHaveAttribute(
      'href',
      /\/app\/history\?tab=sessions/,
    );
    await expect(backLink).toHaveAttribute('href', /offset=0/);
    await expect(backLink).toHaveAttribute('href', /limit=20/);
  });

  test('History Questions tab provides standalone review without navigator (BUG-152)', async ({
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
    const noQuestionsMessage = page.getByText(
      /No Quick Practice questions yet/i,
    );

    // Wait for either the question list to load or for the empty state to appear.
    await questionLink.or(noQuestionsMessage).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const hasNoQuestions = await noQuestionsMessage
      .isVisible()
      .catch(() => false);
    expect(
      hasNoQuestions,
      '[E2E_BASELINE_MISSING] Expected at least one Quick Practice question in history.',
    ).toBe(false);

    // Verify the link does NOT contain sessionId or historySeq (BUG-152: removed)
    const href = await questionLink.getAttribute('href');
    expect(href).not.toContain('sessionId=');
    expect(href).not.toContain('historySeq=');
    expect(href).not.toContain('historyIndex=');

    // Click to navigate to the question
    await questionLink.click();

    // Verify URL is standalone review — no sessionId, no historySeq
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/sessionId=/);
    await expect(page).not.toHaveURL(/historySeq=/);
    await expect(page).not.toHaveURL(/historyIndex=/);
    await expect(page).toHaveURL(/from=history/);
    await expect(page).toHaveURL(/mode=review/);

    // Wait for question content to load
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // BUG-152: standalone review has NO Question Navigator
    await expect(page.getByText('Question navigator')).toBeHidden({
      timeout: 5_000,
    });

    // Verify back link goes to History Questions tab
    const backLink = page
      .getByRole('link', { name: 'Back to History' })
      .first();
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toHaveAttribute(
      'href',
      /\/app\/history\?tab=questions/,
    );
  });
});
