import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

async function appendTallPageContentBeforeActionBar(
  page: Page,
  fillerId: string,
): Promise<void> {
  const metrics = await page.evaluate(
    ({ fillerId }) => {
      const actionBar = document.querySelector(
        '[data-testid="bottom-action-bar"]',
      );
      if (!(actionBar instanceof HTMLElement)) {
        throw new Error('Expected bottom action bar to exist');
      }

      document.getElementById(fillerId)?.remove();

      const filler = document.createElement('div');
      filler.id = fillerId;
      filler.setAttribute('aria-hidden', 'true');
      filler.style.height = '1600px';
      actionBar.before(filler);

      const scrollingElement = document.scrollingElement;
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error('Expected a document scrolling element');
      }

      return {
        clientHeight: scrollingElement.clientHeight,
        scrollHeight: scrollingElement.scrollHeight,
      };
    },
    { fillerId },
  );

  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
}

async function expectNoStickyScrollRegion(page: Page): Promise<void> {
  await expect(page.getByTestId('sticky-action-bar-layout')).toHaveCount(0);
  await expect(page.getByTestId('sticky-action-bar-scroll-region')).toHaveCount(
    0,
  );
  await expect(page.getByTestId('sticky-action-bar')).toHaveCount(0);
}

async function expectBottomActionBarBelowFold(page: Page): Promise<void> {
  const actionBar = page.getByTestId('bottom-action-bar');
  await expect(actionBar).toBeAttached();

  const box = await actionBar.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) {
    throw new Error('Expected bottom action bar bounds and viewport size');
  }

  expect(box.y).toBeGreaterThan(viewport.height);
}

async function scrollPageToBottom(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scrollingElement =
          document.scrollingElement || document.documentElement;
        window.scrollTo({
          top: scrollingElement.scrollHeight,
          behavior: 'auto',
        });
        return Math.round(
          scrollingElement.scrollHeight - (window.scrollY + window.innerHeight),
        );
      }),
    )
    .toBeLessThanOrEqual(2);
}

async function expectFocusedLocatorInViewport(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused();
  await expect(locator).toBeInViewport();
}

function getActiveQuestionPanel(page: Page): Locator {
  return page.getByTestId('active-question-panel');
}

test.describe('practice', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('subscribed user can run a tutor session and end on summary', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await expect(page.getByText('Recent sessions')).toHaveCount(0);

    await startSession(page, 'tutor');

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    const verdictPill = page.getByText(/^(Correct|Incorrect)$/).first();
    await expect(verdictPill).toBeVisible();
    if ((await verdictPill.textContent())?.trim() === 'Incorrect') {
      await expect(
        page.getByText('Correct Answer', { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText('Correct Answer', { exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByText('Explanation not available.', { exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View in History' }),
    ).toHaveAttribute('href', '/app/history');
  });

  test('quick practice submit shows correctness feedback', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice/quick?status=unanswered');
    await expect(
      page.getByRole('heading', { name: 'Quick Practice' }),
    ).toBeVisible();

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(/^(Correct|Incorrect)$/)).toBeVisible();
  });

  test('uses whole-page scroll for long tutor feedback content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'tutor', 2);

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/^(Correct|Incorrect)$/).first()).toBeVisible({
      timeout: 10_000,
    });

    await expectNoStickyScrollRegion(page);
    await appendTallPageContentBeforeActionBar(
      page,
      'tutor-document-flow-filler',
    );
    await expectBottomActionBarBelowFold(page);

    await scrollPageToBottom(page);
    await expect(page.getByRole('button', { name: 'Next' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Bookmark' })).toBeVisible();
  });

  test('exam mode completes session without showing explanation', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'exam');

    await selectChoiceByLabel(page, 'A');

    // Exam mode does not show feedback or explanations while the exam is active.
    await expect(
      page.getByText('Correct Answer', { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Mark for review' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Review & Submit' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish exam' })).toHaveCount(
      0,
    );
    await expect(
      page
        .getByTestId('bottom-action-bar')
        .getByRole('button', { name: 'Review & Submit' }),
    ).toHaveCount(1);

    // Click "Review & Submit" on the last question to enter exam review view
    await page
      .getByTestId('bottom-action-bar')
      .getByRole('button', { name: 'Review & Submit' })
      .click();

    // Wait for exam review to load with the "Submit exam" button
    const submitExamButton = page.getByRole('button', { name: 'Submit exam' });
    await expect(submitExamButton).toBeVisible({ timeout: 15_000 });

    // Submit the exam via confirmation dialog
    await submitExamButton.click();
    await page.getByRole('button', { name: 'Confirm submit' }).click();

    await expect(
      page.getByRole('heading', { name: /^Score: \d+% \(\d\/1\)$/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('Review each question with detailed feedback.'),
    ).toBeVisible();
    await expect(page.getByText(/^(Correct|Incorrect)$/).first()).toBeVisible();

    await page.getByRole('button', { name: 'View Summary' }).click();

    // Wait for the terminal session summary to appear
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('reopens post-exam review at the first question when Review Answers is clicked from the session summary', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'exam', 3);

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Next' }).click();
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Next' }).click();
    await selectChoiceByLabel(page, 'A');
    await expect(
      page.getByRole('button', { name: 'Review & Submit' }),
    ).toBeVisible();

    await page
      .getByTestId('bottom-action-bar')
      .getByRole('button', { name: 'Review & Submit' })
      .click();

    const submitExamButton = page.getByRole('button', { name: 'Submit exam' });
    await expect(submitExamButton).toBeVisible({ timeout: 15_000 });
    await submitExamButton.click();
    await page.getByRole('button', { name: 'Confirm submit' }).click();

    const getQuestionNavigatorButton = (order: number) =>
      page
        .getByRole('navigation', { name: 'Question navigator' })
        .getByRole('button', {
          name: new RegExp(`^Question ${order}:`),
        });

    await expect(page.getByText('Question 1 of 3')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    await expect(getQuestionNavigatorButton(1)).toHaveAttribute(
      'aria-current',
      'step',
    );

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Question 2 of 3')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Question 3 of 3')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Finish review' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Finish review' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Review Answers' }).click();

    await expect(page.getByText('Question 1 of 3')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Finish review' }),
    ).toHaveCount(0);
    await expect(getQuestionNavigatorButton(1)).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  test('resets the active question viewport after next and previous navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'exam', 2);
    await expectNoStickyScrollRegion(page);
    await appendTallPageContentBeforeActionBar(page, 'exam-question-filler');
    await expectBottomActionBarBelowFold(page);

    await scrollPageToBottom(page);
    await page.getByRole('button', { name: 'Next' }).click();

    await expectFocusedLocatorInViewport(getActiveQuestionPanel(page));
    await expect(page.getByText('Question 2 of 2')).toBeVisible();

    await appendTallPageContentBeforeActionBar(page, 'exam-question-filler');
    await scrollPageToBottom(page);
    await page.getByRole('button', { name: 'Previous' }).click();

    await expectFocusedLocatorInViewport(getActiveQuestionPanel(page));
    await expect(page.getByText('Question 1 of 2')).toBeVisible();
  });

  test('returns to a sensible question-start position when navigating away and back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'exam', 2);
    await appendTallPageContentBeforeActionBar(page, 'history-scroll-filler');
    await scrollPageToBottom(page);

    const scrollBeforeLeaving = await page.evaluate(() => window.scrollY);
    expect(scrollBeforeLeaving).toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 30_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Exam Session' }),
    ).toBeVisible({ timeout: 30_000 });
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (!viewport) {
      throw new Error('Expected viewport dimensions');
    }

    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBeLessThanOrEqual(viewport.height);
    await expect(page.getByText('Question 1 of 2')).toBeVisible();
  });

  test('resets the post-exam review viewport after navigating between reviewed questions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'exam', 2);
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Next' }).click();
    await selectChoiceByLabel(page, 'A');
    await expect(
      page.getByRole('button', { name: 'Review & Submit' }),
    ).toBeVisible();

    await page
      .getByTestId('bottom-action-bar')
      .getByRole('button', { name: 'Review & Submit' })
      .click();

    const submitExamButton = page.getByRole('button', { name: 'Submit exam' });
    await expect(submitExamButton).toBeVisible({ timeout: 15_000 });
    await submitExamButton.click();
    await page.getByRole('button', { name: 'Confirm submit' }).click();

    await expect(
      page.getByText('Review each question with detailed feedback.'),
    ).toBeVisible({ timeout: 30_000 });

    await expectNoStickyScrollRegion(page);
    await appendTallPageContentBeforeActionBar(page, 'post-exam-review-filler');
    await expectBottomActionBarBelowFold(page);

    await scrollPageToBottom(page);
    await page.getByRole('button', { name: 'Next' }).click();

    await expectFocusedLocatorInViewport(
      page.getByRole('region', { name: 'Question 2 of 2' }),
    );
  });
});
