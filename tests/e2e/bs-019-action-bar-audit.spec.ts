import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

/**
 * BS-019: Action Bar Label and Ordering Consistency
 *
 * Audits the bottom action bar across Quick Practice, Tutor, Exam,
 * and History Review to verify the 8 inconsistencies documented in
 * docs/brainstorming/bs-019-action-bar-label-and-ordering-consistency.md
 *
 * Uses direct role/text assertions instead of container extraction
 * for robustness across React re-renders.
 */

function escapeExactText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Assert a data-slot="button" element with the given text has the expected tagName. */
async function expectElementTag(
  page: Page,
  text: string,
  expectedTag: 'BUTTON' | 'A',
): Promise<void> {
  const exactText = new RegExp(`^${escapeExactText(text)}$`);
  const el = page
    .locator('[data-slot="button"]')
    .filter({ hasText: exactText })
    .first();
  await expect(el).toBeVisible({ timeout: 5_000 });
  const tag = await el.evaluate((node) => node.tagName);
  expect(tag, `Expected "${text}" to be <${expectedTag.toLowerCase()}>`).toBe(
    expectedTag,
  );
}

/**
 * Get ordered button labels from the History Review action bar.
 * History view uses data-testid="bottom-action-bar".
 */
async function getHistoryBarLabels(page: Page): Promise<string[]> {
  const container = page.getByTestId('bottom-action-bar');
  await expect(container).toBeVisible({ timeout: 15_000 });
  const elements = container.locator('[data-slot="button"]');
  const count = await elements.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = ((await elements.nth(i).textContent()) ?? '').trim();
    if (text) labels.push(text);
  }
  return labels;
}

test.describe('BS-019: Action Bar Label and Ordering Audit', () => {
  // Outlier budget: this spec exercises four full authenticated flows
  // (Quick Practice, Tutor, Exam, History review) with repeated navigation
  // and screenshot capture. Keep 300s until the suite is split.
  // Tracked by DEBT-226.
  test.setTimeout(300_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('Quick Practice: pre-submit and post-submit action bar', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice/quick?status=incorrect', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Quick Practice' }),
    ).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible({
      timeout: 15_000,
    });

    // ── Pre-submit ──

    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible();

    // BS-019 Inconsistency 3: No Previous (ad hoc mode, by design)
    await expect(
      page.locator('[data-slot="button"]', { hasText: '← Previous' }),
    ).toHaveCount(0);

    // Verify all are <button> elements (BS-019 Inconsistency 9)
    await expectElementTag(page, 'Submit', 'BUTTON');
    await expectElementTag(page, 'Next →', 'BUTTON');
    await expectElementTag(page, 'Bookmark', 'BUTTON');

    // Submit disabled (no choice selected)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await page.screenshot({
      path: 'test-results/bs019/quick-practice-pre-submit.png',
    });

    // ── Post-submit ──
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });

    // BS-019 Inconsistency 7: Submit stays in DOM, disabled (Practice doesn't swap to Try Again)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await expect(
      page.locator('[data-slot="button"]', { hasText: 'Try Again' }),
    ).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/bs019/quick-practice-post-submit.png',
    });
  });

  test('Tutor session: Q1 and Q2 action bar states', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'tutor', 2);

    // ── Q1 pre-submit ──

    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible();

    // All buttons present
    await expect(
      page.getByRole('button', { name: '← Previous' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Bookmark$/ }),
    ).toBeVisible();

    // No Mark for review in Tutor mode
    await expect(
      page.getByRole('button', { name: 'Mark for review' }),
    ).toHaveCount(0);

    // BS-019 Inconsistency 4: Q1 Previous — PRESENT but DISABLED
    await expect(
      page.getByRole('button', { name: '← Previous' }),
    ).toBeDisabled();

    // Submit disabled (no choice selected)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();

    // All elements are <button> in Practice view
    await expectElementTag(page, '← Previous', 'BUTTON');
    await expectElementTag(page, 'Submit', 'BUTTON');
    await expectElementTag(page, 'Next →', 'BUTTON');
    await expectElementTag(page, 'Bookmark', 'BUTTON');

    await page.screenshot({
      path: 'test-results/bs019/tutor-q1-pre-submit.png',
    });

    // ── Q1 post-submit ──
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });

    // BS-019 Inconsistency 7: Submit stays disabled in DOM
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await page.screenshot({
      path: 'test-results/bs019/tutor-q1-post-submit.png',
    });

    // ── Navigate to Q2 ──
    await page.getByRole('button', { name: 'Next →' }).click();
    await expect(
      page.getByRole('group', { name: 'Answer choices' }),
    ).toBeVisible({ timeout: 60_000 });

    // Q2: Previous should be ENABLED (not first question)
    await expect(
      page.getByRole('button', { name: '← Previous' }),
    ).toBeEnabled();

    await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();

    await page.screenshot({
      path: 'test-results/bs019/tutor-q2-pre-submit.png',
    });

    // End session for cleanup
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Exam session: action bar includes Mark for review', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'exam', 1);

    // Exam has all tutor buttons plus "Mark for review"
    await expect(
      page.getByRole('button', { name: '← Previous' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next →' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Bookmark$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark for review' }),
    ).toBeVisible();

    // All <button> elements
    await expectElementTag(page, 'Mark for review', 'BUTTON');

    await page.screenshot({
      path: 'test-results/bs019/exam-q1.png',
    });

    // Cleanup: submit + end exam (best-effort, test assertions already passed)
    try {
      await selectChoiceByLabel(page, 'A');
      await page.getByRole('button', { name: 'Submit' }).click();
      await page.getByRole('button', { name: 'Review answers' }).click();
      await expect(
        page.getByRole('heading', { name: 'Review Questions' }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Submit exam' }).click();
      await expect(
        page.getByRole('heading', { name: 'Session Summary' }),
      ).toBeVisible({ timeout: 15_000 });
    } catch (error) {
      // Cleanup failed — session will be abandoned by startSession helper in next test
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      test.info().annotations.push({
        type: 'warning',
        description: `cleanup failed in bs-019-action-bar-audit (exam): ${message}`,
      });
    }
  });

  test('History Session Review: labels, ordering, element types, boundary behavior', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Use existing completed sessions from History (Tutor test already created one).
    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    const viewBreakdownButton = page
      .getByRole('button', { name: /View breakdown/i })
      .first();
    await expect(viewBreakdownButton).toBeVisible({ timeout: 15_000 });
    await viewBreakdownButton.click();

    const breakdownLinks = page.locator('a[href*="/app/questions/"]');
    await expect(breakdownLinks.first()).toBeVisible({ timeout: 15_000 });

    const linkCount = await breakdownLinks.count();
    if (linkCount < 2) {
      test.skip(
        true,
        'No session with 2+ questions found — cannot test prev/next boundary',
      );
      return;
    }

    // Click first question link
    const firstLink = breakdownLinks.first();
    await expect(firstLink).toHaveAttribute('href', /mode=review/);
    await expect(firstLink).toHaveAttribute('href', /sessionId=/);
    await firstLink.click();

    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/sessionId=/);
    await expect(page).toHaveURL(/mode=review/);
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 30_000,
    });

    // Wait for session navigation and review data to fully load
    await expect(page.getByText(/Question \d+ of \d+/)).toBeVisible({
      timeout: 30_000,
    });
    // Wait for "Back to" link — only appears after async review data settles
    const backToLink = page
      .getByTestId('bottom-action-bar')
      .locator('[data-slot="button"]')
      .filter({ hasText: /^Back to/ })
      .first();
    await expect(backToLink).toBeVisible({ timeout: 15_000 });

    // ── Q1 (first question) ──
    const labelsQ1 = await getHistoryBarLabels(page);

    expect(labelsQ1).toContain('Next →');
    expect(labelsQ1).toContain('← Previous');

    // BS-019 Inconsistency 6: No Bookmark in History Review
    expect(labelsQ1).not.toContain('Bookmark');
    expect(labelsQ1).not.toContain('Remove bookmark');

    expect(labelsQ1.some((l) => l.startsWith('Back to'))).toBe(true);

    const prevBtnQ1 = page
      .getByTestId('bottom-action-bar')
      .locator('[data-slot="button"]')
      .filter({ hasText: '← Previous' })
      .first();
    await expect(prevBtnQ1).toBeDisabled();
    const prevTagQ1 = await prevBtnQ1.evaluate((el) => el.tagName);
    expect(prevTagQ1).toBe('BUTTON');

    const nextBtn = page
      .getByTestId('bottom-action-bar')
      .locator('[data-slot="button"]')
      .filter({ hasText: 'Next →' })
      .first();
    const nextTag = await nextBtn.evaluate((el) => el.tagName);
    expect(nextTag).toBe('A');

    const tryAgainBtn = page
      .getByTestId('bottom-action-bar')
      .locator('[data-slot="button"]')
      .filter({ hasText: /^Try Again$/ })
      .first();
    const tryAgainVisible = await expect(tryAgainBtn)
      .toBeVisible({ timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (tryAgainVisible) {
      const tryAgainTag = await tryAgainBtn.evaluate((el) => el.tagName);
      expect(tryAgainTag).toBe('BUTTON');

      expect(labelsQ1.indexOf('← Previous')).toBeLessThan(
        labelsQ1.indexOf('Try Again'),
      );
      expect(labelsQ1.indexOf('Try Again')).toBeLessThan(
        labelsQ1.indexOf('Next →'),
      );
      expect(labelsQ1).not.toContain('Submit');
    }

    await page.screenshot({
      path: 'test-results/bs019/history-q1-answered.png',
    });

    // ── Navigate to last question via ReviewQuestionNavigator grid ──
    // The grid has numbered buttons for each question in the session.
    const navigatorCard = page.locator('nav[aria-label="Question navigator"]');
    await expect(navigatorCard).toBeVisible({ timeout: 10_000 });

    // Find the total question count from "Question X of Y" text
    const positionText = await page
      .getByText(/Question \d+ of \d+/)
      .textContent();
    expect(positionText).not.toBeNull();
    const totalMatch = positionText?.match(/of (\d+)/);
    expect(totalMatch).not.toBeNull();
    const totalQuestions = Number.parseInt(totalMatch?.[1] ?? '0', 10);
    expect(
      totalQuestions,
      'Expected "Question X of Y" text with totalQuestions >= 2',
    ).toBeGreaterThanOrEqual(2);

    // Click the LAST question button in the navigator grid
    const lastQButton = navigatorCard
      .locator(
        `[data-slot="button"][aria-label*="Question ${totalQuestions}:"]`,
      )
      .first();
    await expect(lastQButton).toBeVisible({ timeout: 5_000 });

    const isCurrentLast = await lastQButton.getAttribute('aria-current');
    if (isCurrentLast !== 'step') {
      // Navigate to the last question
      const urlBefore = page.url();
      await lastQButton.click();
      await page.waitForURL(
        (url) =>
          url.toString() !== urlBefore &&
          url.pathname.startsWith('/app/questions/'),
        { timeout: 15_000 },
      );
      await expect(page.getByText(/Loading question/i)).toBeHidden({
        timeout: 30_000,
      });
      await expect(
        page.getByText(`Question ${totalQuestions} of ${totalQuestions}`),
      ).toBeVisible({ timeout: 15_000 });

      // Wait for review data to fully load — "Back to" only appears after
      // async session navigation data settles (not in default/pre-load state)
      const backToLinkLast = page
        .getByTestId('bottom-action-bar')
        .locator('[data-slot="button"]')
        .filter({ hasText: /^Back to/ })
        .first();
      await expect(backToLinkLast).toBeVisible({ timeout: 15_000 });
    }

    const labelsLast = await getHistoryBarLabels(page);

    // Last Q: Previous present
    expect(labelsLast).toContain('← Previous');

    // SPEC-032 fix: Last Q shows disabled Next (consistent with Practice)
    expect(labelsLast).toContain('Next →');

    // Previous is enabled link, Next is disabled button.
    const prevBtn = page
      .getByTestId('bottom-action-bar')
      .locator('[data-slot="button"]')
      .filter({ hasText: '← Previous' })
      .first();
    const prevTag = await prevBtn.evaluate((el) => el.tagName);
    expect(prevTag).toBe('A');

    const nextBtnLast = page
      .getByTestId('bottom-action-bar')
      .locator('[data-slot="button"]')
      .filter({ hasText: 'Next →' })
      .first();
    await expect(nextBtnLast).toBeDisabled();
    const nextTagLast = await nextBtnLast.evaluate((el) => el.tagName);
    expect(nextTagLast).toBe('BUTTON');

    await page.screenshot({
      path: 'test-results/bs019/history-last-q-answered.png',
    });
  });
});
