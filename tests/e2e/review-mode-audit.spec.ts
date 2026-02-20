import { expect, type Page, test } from '@playwright/test';
import { ensureBookmarkExistsOnBookmarksPage } from './helpers/bookmark';
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

// Seeded by content/questions/placeholder/*.mdx
const CORRECT_SLUG = 'placeholder-01-naltrexone-mechanism';
const INCORRECT_SLUG = 'placeholder-02-buprenorphine-induction-timing';

function getFeedbackCard(page: Page) {
  return page.locator('[role="alert"]').filter({
    hasText: /^(Correct|Incorrect)/,
  });
}

async function expectFeedbackVisible(page: Page): Promise<void> {
  await expect(getFeedbackCard(page)).toBeVisible({ timeout: 10_000 });
}

async function expectFeedbackHidden(page: Page): Promise<void> {
  await expect(getFeedbackCard(page)).toHaveCount(0);
}

async function expectChoiceChecked(
  page: Page,
  label: 'A' | 'B' | 'C' | 'D',
): Promise<void> {
  const choiceLabel = page
    .locator('label')
    .filter({
      has: page.locator(`div.rounded-full:text-is("${label}")`),
    })
    .first();
  await expect(choiceLabel).toBeVisible({ timeout: 30_000 });
  await expect(choiceLabel.locator('input[type="radio"]')).toBeChecked();
}

async function expectNoChoicesChecked(page: Page): Promise<void> {
  const radios = page.locator('input[type="radio"]');
  await expect(radios.first()).toBeVisible({ timeout: 15_000 });
  const count = await radios.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(radios.nth(i)).not.toBeChecked();
  }
}

test.describe('review mode audit', () => {
  // Multi-page audit flows can exceed the default timeout due to sequential navigation and assertions in CI.
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('dashboard recent activity opens questions in review mode', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, CORRECT_SLUG);

    const selectedLabel = await submitQuestionForOutcome(
      page,
      CORRECT_SLUG,
      'Correct',
    );

    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();

    const dashboardLink = page
      .locator(`a[href*="${CORRECT_SLUG}"][href*="from=dashboard"]`)
      .first();
    await expect(dashboardLink).toBeVisible({ timeout: 15_000 });
    await expect(dashboardLink).toHaveAttribute('href', /mode=review/);

    await dashboardLink.click();

    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/from=dashboard/);
    await expect(page).toHaveURL(/mode=review/);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await expectFeedbackVisible(page);
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await expectChoiceChecked(page, selectedLabel);
  });

  test('history questions: correct and incorrect open review mode', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, CORRECT_SLUG);
    await assertQuestionSlugExists(page, INCORRECT_SLUG);

    const correctLabel = await submitQuestionForOutcome(
      page,
      CORRECT_SLUG,
      'Correct',
    );
    const incorrectLabel = await submitQuestionForOutcome(
      page,
      INCORRECT_SLUG,
      'Incorrect',
    );

    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    const correctLinks = page.locator(
      `a[href^="/app/questions/${CORRECT_SLUG}"][href*="from=history"]`,
    );
    await expect(correctLinks.first()).toBeVisible({ timeout: 15_000 });
    const correctLinkCount = await correctLinks.count();
    expect(correctLinkCount).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < correctLinkCount; i++) {
      await expect(correctLinks.nth(i)).toHaveAttribute('href', /mode=review/);
    }

    const reviewAction = page.locator(
      `a[aria-label^="Review question:"][href^="/app/questions/${CORRECT_SLUG}"]`,
    );
    await expect(reviewAction).toBeVisible({ timeout: 15_000 });
    await reviewAction.click();

    await expect(page).toHaveURL(/from=history/);
    await expect(page).toHaveURL(/mode=review/);
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });
    await expectFeedbackVisible(page);
    await expectChoiceChecked(page, correctLabel);

    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    const incorrectLinks = page.locator(
      `a[href^="/app/questions/${INCORRECT_SLUG}"][href*="from=history"]`,
    );
    await expect(incorrectLinks.first()).toBeVisible({ timeout: 15_000 });
    const incorrectLinkCount = await incorrectLinks.count();
    expect(incorrectLinkCount).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < incorrectLinkCount; i++) {
      await expect(incorrectLinks.nth(i)).toHaveAttribute(
        'href',
        /mode=review/,
      );
    }

    const reviewIncorrectAction = page.locator(
      `a[aria-label^="Review question:"][href^="/app/questions/${INCORRECT_SLUG}"]`,
    );
    await expect(reviewIncorrectAction).toBeVisible({ timeout: 15_000 });
    await reviewIncorrectAction.click();

    await expect(page).toHaveURL(/from=history/);
    await expect(page).toHaveURL(/mode=review/);
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });
    await expectFeedbackVisible(page);
    await expectChoiceChecked(page, incorrectLabel);
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  });

  test('session breakdown links open questions in review mode', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'tutor', 1);
    // Hardcoded 'A' is intentional: we verify the user's selected choice is
    // restored in review mode, regardless of whether it was correct or not.
    await selectChoiceByLabel(page, 'A');
    const selectedChoice = page
      .locator('label')
      .filter({ has: page.locator('input[type="radio"]:checked') })
      .first();
    await expect(selectedChoice).toBeVisible({ timeout: 15_000 });
    const selectedChoiceText = (
      await selectedChoice.locator('p').first().textContent()
    )?.trim();
    expect(selectedChoiceText).toBeTruthy();

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 15_000 });

    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 15_000 });
    await expect(breakdownLink).toHaveAttribute('href', /mode=review/);

    await breakdownLink.click();
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/mode=review/);
    await expect(page).toHaveURL(/from=practice/);
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });
    await expectFeedbackVisible(page);
    const reviewChoice = page
      .locator('label')
      .filter({ has: page.locator('input[type="radio"]:checked') })
      .first();
    await expect(reviewChoice).toBeVisible({ timeout: 15_000 });
    const reviewChoiceText = (
      await reviewChoice.locator('p').first().textContent()
    )?.trim();
    expect(reviewChoiceText).toBe(selectedChoiceText);
  });

  test('session review is read-only and non-session review allows reattempt', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, CORRECT_SLUG);

    await startSession(page, 'tutor', 1);
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expectFeedbackVisible(page);

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 15_000 });

    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 15_000 });
    await expect(breakdownLink).toHaveAttribute('href', /mode=review/);
    await expect(breakdownLink).toHaveAttribute('href', /sessionId=/);

    await breakdownLink.click();
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/mode=review/);
    await expect(page).toHaveURL(/sessionId=/);
    await expectFeedbackVisible(page);
    await expect(page.getByRole('button', { name: 'Try Again' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);

    await submitQuestionForOutcome(page, CORRECT_SLUG, 'Correct');

    await page.goto(`/app/questions/${CORRECT_SLUG}?from=history&mode=review`);
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });
    await expectFeedbackVisible(page);
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

    await page.getByRole('button', { name: 'Try Again' }).click();

    await expectFeedbackHidden(page);
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoChoicesChecked(page);
  });

  test('bookmarks links do not include mode=review', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await ensureBookmarkExistsOnBookmarksPage(page);

    const questionLinks = page.locator('a[href^="/app/questions/"]');
    await expect(questionLinks.first()).toBeVisible({ timeout: 15_000 });
    const count = await questionLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await questionLinks.nth(i).getAttribute('href');
      expect(href).not.toContain('mode=review');
    }
  });

  test('post-submit feedback component renders correctly', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, CORRECT_SLUG);

    await page.goto(`/app/questions/${CORRECT_SLUG}`);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    const feedbackCard = getFeedbackCard(page);
    await expect(feedbackCard).toBeVisible({ timeout: 10_000 });

    await expect(
      feedbackCard.getByText(/^(Correct|Incorrect)$/).first(),
    ).toBeVisible();
    await expect(
      feedbackCard.getByText('Explanation', { exact: true }),
    ).toBeVisible();

    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

    const correctChoice = page.locator('label.border-success');
    await expect(correctChoice.first()).toBeVisible();

    const radios = page.locator('input[type="radio"]');
    await expect(radios.first()).toBeVisible({ timeout: 15_000 });
    const radioCount = await radios.count();
    expect(radioCount).toBeGreaterThan(0);
    for (let i = 0; i < radioCount; i++) {
      await expect(radios.nth(i)).toBeDisabled();
    }
  });
});
