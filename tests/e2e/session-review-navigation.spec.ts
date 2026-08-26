import { expect, type Page, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  expectVerdictPillVisible,
  selectChoiceByLabel,
  waitForQuestionLoadingToFinish,
} from './helpers/question';
import { parseQuestionProgressCount } from './helpers/question-progress';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

function getVisibleQuestionNavigator(page: Page) {
  return page.locator('nav[aria-label="Question navigator"]:visible');
}

async function getCurrentNavigatorButtonText(page: Page) {
  const currentButton = getVisibleQuestionNavigator(page).locator(
    '[aria-current="step"]',
  );
  await expect(currentButton).toHaveCount(1, { timeout: 15_000 });
  return currentButton.textContent();
}

test.describe('session review navigation (SPEC-027)', () => {
  // Multi-page audit flows can exceed the default timeout due to sequential navigation and assertions in CI.
  test.setTimeout(180_000);
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('Session Summary → sequential review with prev/next navigation', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Create a tutor session with 2 questions
    await startSession(page, 'tutor', 2);
    await expect(page.getByText('Question 1 of 2')).toBeVisible({
      timeout: 15_000,
    });

    // Answer question 1: select choice commits in tutor mode, then navigate next
    await selectChoiceByLabel(page, 'A');
    await expectVerdictPillVisible(page);
    const activeSessionNextButton = page.getByRole('button', {
      name: 'Next',
    });
    await expect(activeSessionNextButton).toBeEnabled({ timeout: 10_000 });
    await activeSessionNextButton.click();

    // Answer question 2: select choice commits in tutor mode
    await selectChoiceByLabel(page, 'A');
    await expectVerdictPillVisible(page);

    // End session from the tutor footer; the header bail button has the same label.
    const footerEndSessionButton = page
      .getByTestId('tutor-action-primary-group')
      .getByRole('button', { name: 'End session' });
    await expect(footerEndSessionButton).toBeEnabled({ timeout: 10_000 });
    await footerEndSessionButton.click();
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

    // Verify URL contains sessionId, from=summary, mode=review
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/sessionId=/);
    await expect(page).toHaveURL(/from=summary/);
    await expect(page).toHaveURL(/mode=review/);

    // Wait for question content to load
    await waitForQuestionLoadingToFinish(page);

    // SPEC-028: ReviewQuestionNavigator grid
    const navigatorCard =
      getVisibleQuestionNavigator(page).locator('[data-slot="card"]');
    const navigatorHeading = getVisibleQuestionNavigator(page).getByRole(
      'heading',
      { name: 'Question navigator' },
    );
    await expect(navigatorHeading).toBeVisible({ timeout: 15_000 });
    await expect(getVisibleQuestionNavigator(page)).toHaveCount(1, {
      timeout: 15_000,
    });

    const reviewProgressIndicator = page.getByText(/^Question 1 of \d+\b/);
    await expect(reviewProgressIndicator).toBeVisible({ timeout: 15_000 });
    const reviewQuestionCount = parseQuestionProgressCount(
      (await reviewProgressIndicator.textContent()) ?? '',
    );

    const navigatorButtons = navigatorCard.locator('[data-slot="button"]');
    await expect(navigatorButtons).toHaveCount(reviewQuestionCount, {
      timeout: 15_000,
    });

    await expect(
      navigatorCard.locator(
        '[data-slot="button"][aria-label*=": Correct"], [data-slot="button"][aria-label*=": Incorrect"]',
      ),
    ).toHaveCount(reviewQuestionCount, { timeout: 15_000 });

    const currentNavigatorButton = navigatorCard.locator(
      '[aria-current="step"]',
    );
    await expect(currentNavigatorButton).toBeVisible({ timeout: 15_000 });
    const navigatorCurrentTextOnFirstQuestion =
      await currentNavigatorButton.textContent();
    expect(navigatorCurrentTextOnFirstQuestion).not.toBeNull();

    // Verify the summary-origin review path returns to the session summary.
    const backLink = page
      .getByRole('link', { name: 'Back to Summary' })
      .first();
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toHaveAttribute(
      'href',
      `/app/practice/${sessionId}`,
    );

    // Verify "Next" link is present (we're on question 1)
    const nextLink = page.getByRole('link', { name: 'Next' });
    await expect(nextLink).toBeVisible({ timeout: 15_000 });

    // Verify position indicator "Question 1 of 2"
    await expect(page.getByText('Question 1 of 2')).toBeVisible({
      timeout: 15_000,
    });

    // Click "Next"
    const urlBeforeNext = page.url();
    await nextLink.click();

    // Wait for navigation
    await page.waitForURL(
      (url) =>
        url.toString() !== urlBeforeNext &&
        url.pathname.startsWith('/app/questions/') &&
        url.searchParams.get('sessionId') === sessionId &&
        url.searchParams.get('from') === 'summary' &&
        url.searchParams.get('mode') === 'review',
      { timeout: 15_000 },
    );
    await waitForQuestionLoadingToFinish(page);

    // Verify "Previous" link is present on question 2
    await expect(page.getByRole('link', { name: 'Previous' })).toBeVisible({
      timeout: 15_000,
    });

    // Verify position indicator "Question 2 of 2"
    await expect(page.getByText('Question 2 of 2')).toBeVisible({
      timeout: 15_000,
    });

    // Boundary controls are hidden at the end of the review sequence.
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Next' })).toHaveCount(0, {
      timeout: 15_000,
    });

    // SPEC-028: jump navigation via ReviewQuestionNavigator
    const navigatorCurrentTextOnSecondQuestion =
      await getCurrentNavigatorButtonText(page);
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
        url.searchParams.get('from') === 'summary' &&
        url.searchParams.get('mode') === 'review',
      { timeout: 15_000 },
    );
    await waitForQuestionLoadingToFinish(page);
    await expect(
      getVisibleQuestionNavigator(page).getByRole('heading', {
        name: 'Question navigator',
      }),
    ).toBeVisible({
      timeout: 15_000,
    });

    const navigatorCurrentTextAfterJump =
      await getCurrentNavigatorButtonText(page);
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
    await waitForQuestionLoadingToFinish(page);

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
    await expect(page).not.toHaveURL(/source=/);

    // The reset helper seeds a completed tutor session plus an adhoc attempt.
    // Assert the default Questions tab surfaces the tutor-backed row without
    // requiring a source query param.
    const tutorQuestionRow = page
      .locator('li', {
        has: page.locator('a[href*="/app/questions/"]'),
      })
      .filter({ hasText: 'Tutor session' })
      .first();
    const noQuestionsMessage = page.getByText(/No questions attempted yet/i);

    // Wait for either the tutor-backed row to load or the empty state to appear.
    await tutorQuestionRow.or(noQuestionsMessage).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const hasNoQuestions = await noQuestionsMessage
      .isVisible()
      .catch(() => false);
    expect(
      hasNoQuestions,
      '[E2E_BASELINE_MISSING] Expected a tutor-backed attempted question in the default History Questions view.',
    ).toBe(false);

    await expect(
      tutorQuestionRow,
      '[E2E_BASELINE_MISSING] Expected a tutor-backed attempted question in the default History Questions view.',
    ).toBeVisible({ timeout: 15_000 });

    const questionLink = tutorQuestionRow
      .locator('a[href*="/app/questions/"]')
      .first();
    await expect(questionLink).toBeVisible({ timeout: 15_000 });

    // Verify the default all-sources view keeps standalone review links clean:
    // no sessionId, no source filter, no removed history sequence params.
    const href = await questionLink.getAttribute('href');
    expect(href).not.toContain('source=');
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
    await waitForQuestionLoadingToFinish(page);

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
