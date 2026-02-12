import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  assertQuestionSlugExists,
  selectChoiceByLabel,
} from './helpers/question';
import { ensureSubscribed } from './helpers/subscription';

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

// Imported question with per-choice explanations (for Bug B label desync test)
const IMPORTED_QUESTION_SLUG = 'anton-2006-combine-001';

/**
 * Extract the letter→text mapping from QuestionCard choices.
 *
 * DOM structure per choice:
 *   <label>
 *     <input type="radio" class="sr-only" />
 *     <div class="flex ...">
 *       <div class="... rounded-full ...">A</div>
 *       <div class="prose ..."><p>Answer text</p></div>
 *     </div>
 *   </label>
 */
async function extractQuestionCardLabels(
  page: Page,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const choices = page.locator('fieldset label');
  const count = await choices.count();

  for (let i = 0; i < count; i++) {
    const choice = choices.nth(i);
    const letterEl = choice.locator('div.rounded-full').first();
    const letter = (await letterEl.textContent())?.trim() ?? '';

    // The answer text is in the sibling element after the rounded-full circle
    const textEl = choice.locator('.flex.items-start > div:not(.rounded-full)');
    const text = (await textEl.textContent())?.trim() ?? '';

    if (letter && text) {
      map.set(letter, text);
    }
  }

  return map;
}

/**
 * Extract the letter→text mapping from Feedback "Why other answers are wrong" section.
 *
 * DOM structure per explanation:
 *   <div class="rounded-xl border ...">
 *     <div class="flex items-start gap-1 ...">
 *       <span class="shrink-0">B)</span>
 *       <div class="prose ..."><p>Answer text</p></div>
 *     </div>
 *     ...
 *   </div>
 */
async function extractFeedbackLabels(page: Page): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // The "Why other answers are wrong" section is inside the feedback card [role="alert"]
  const feedbackCard = page.locator('[role="alert"]').first();
  const explanationBlocks = feedbackCard.locator(
    'div.rounded-xl.border span.shrink-0',
  );
  const count = await explanationBlocks.count();

  for (let i = 0; i < count; i++) {
    const labelSpan = explanationBlocks.nth(i);
    const labelText = (await labelSpan.textContent())?.trim() ?? '';
    // Label format is "B)" — strip the closing paren
    const letter = labelText.replace(')', '').trim();

    // Get the sibling text (the answer text markdown)
    const parentDiv = labelSpan.locator('..');
    const textEl = parentDiv.locator('div').first();
    const text = (await textEl.textContent())?.trim() ?? '';

    if (letter && text) {
      map.set(letter, text);
    }
  }

  return map;
}

test.describe('brainstorming audit — validate documented issues', () => {
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  /**
   * BS-011 Bug B: Choice Label Desync (regression)
   *
   * The standalone question page (/app/questions/[slug]) renders choices
   * in QuestionCard and choice explanations in Feedback. Both must use the
   * same deterministic shuffle (buildShuffledChoiceViews) so that letter
   * labels map to the same answer text in both sections.
   *
   * This test submits a question, then compares the letter→text mapping
   * from QuestionCard vs Feedback. If the labels are consistent,
   * every letter in the feedback should map to the same answer text
   * as the corresponding letter in the question card.
   */
  test('BS-011 Bug B: feedback choice labels match question card choice labels', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, IMPORTED_QUESTION_SLUG);

    // Use an imported question that has per-choice explanations so the
    // "Why other answers are wrong" section renders in Feedback.
    await page.goto(`/app/questions/${IMPORTED_QUESTION_SLUG}`);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await selectChoiceByLabel(page, 'A');

    // Extract question card labels BEFORE submit (choices stay visible after
    // but we want to capture the pre-submit label→text mapping)
    const questionCardLabels = await extractQuestionCardLabels(page);
    expect(questionCardLabels.size).toBeGreaterThanOrEqual(3);

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(
      page
        .locator('[role="alert"]')
        .filter({ hasText: /^(Correct|Incorrect)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for "Why other answers are wrong" section
    const whySection = page.getByText('Why other answers are wrong:');
    const hasFeedbackExplanations = await whySection
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hasFeedbackExplanations,
      'Question has no choice explanations — cannot verify label sync',
    );

    // Extract labels from Feedback
    const feedbackLabels = await extractFeedbackLabels(page);
    expect(feedbackLabels.size).toBeGreaterThan(0);

    // Compare: every letter in feedback should map to the same answer text
    // as the same letter in the question card
    const mismatches: string[] = [];
    for (const [letter, feedbackText] of feedbackLabels) {
      const questionCardText = questionCardLabels.get(letter);
      if (questionCardText !== feedbackText) {
        mismatches.push(
          `Label ${letter}: QuestionCard="${questionCardText}" vs Feedback="${feedbackText}"`,
        );
      }
    }

    // Regression assertion: letter labels must map to the same answer text
    // in both QuestionCard and Feedback.
    expect(
      mismatches,
      `BS-011 Bug B: ${mismatches.length} label(s) mismatch between QuestionCard and Feedback on /app/questions/${IMPORTED_QUESTION_SLUG}.\n${mismatches.join('\n')}`,
    ).toHaveLength(0);
  });

  /**
   * BS-012: No Question Status filter on Practice session creation.
   *
   * The Practice page currently has Mode, Count, Difficulty, and Tags —
   * but no way to filter by question status (Unanswered/Incorrect/Marked/All).
   */
  test('BS-012: Practice page has no question status filter', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    // Wait for the form to load
    const startButton = page.getByRole('button', { name: 'Start session' });
    const abandonButton = page.getByRole('button', {
      name: 'Abandon session',
    });
    await startButton.or(abandonButton).waitFor({ state: 'visible' });

    // Verify existing filters are present (so we know the form loaded)
    await expect(
      page.getByRole('button', { name: 'Tutor', exact: true }),
    ).toBeVisible();

    // Assert that question status filter elements are ABSENT
    // These are the status filter options that BS-012 proposes adding
    const statusLabels = ['Unanswered', 'Incorrect', 'Marked'];
    for (const label of statusLabels) {
      // Check for both button and text variants
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toHaveCount(0);
    }

    // Also check there's no "Status" label/heading in the form
    await expect(page.getByText('Status', { exact: true })).toHaveCount(0);
  });

  /**
   * BS-012: Quick Practice has no filters at all.
   *
   * Quick Practice immediately serves a random question with no
   * filtering capabilities — not even difficulty or tags.
   */
  test('BS-012: Quick Practice page has no filters', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice/quick');
    await expect(
      page.getByRole('heading', { name: 'Quick Practice' }),
    ).toBeVisible();

    // Wait for a question to fully load (loading state can take time)
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible({
      timeout: 30_000,
    });

    // Assert no filter-related UI exists
    const filterLabels = [
      'Unanswered',
      'Incorrect',
      'Marked',
      'Status',
      'Difficulty',
      'Easy',
      'Medium',
      'Hard',
    ];
    for (const label of filterLabels) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toHaveCount(0);
    }
  });

  /**
   * BS-011 Bug A: History Questions tab — Incorrect rows omit mode=review.
   *
   * This is already tested in review-mode-audit.spec.ts (test: "history
   * questions: correct opens review mode, incorrect opens reattempt").
   * That test ASSERTS the current behavior as expected (incorrect opens
   * reattempt). This test validates from the URL perspective that
   * incorrect row hrefs lack the mode=review param.
   *
   * Note: this test documents the current behavior. When BS-011 Bug A
   * is fixed, this test should be updated to expect mode=review on ALL rows.
   */
  test('BS-011 Bug A: History Questions tab incorrect rows lack mode=review', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    // Ensure we have an incorrect attempt
    const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
    for (const label of labels) {
      await page.goto(`/app/questions/${QUESTION_SLUG}`);
      await expect(page.getByText(/Loading question/i)).toBeHidden({
        timeout: 15_000,
      });
      await selectChoiceByLabel(page, label);
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
        timeout: 10_000,
      });

      const isIncorrect = await page
        .getByText('Incorrect', { exact: true })
        .isVisible()
        .catch(() => false);
      if (isIncorrect) break;
    }

    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Find the link for our question
    const questionLink = page
      .locator(`a[href*="${QUESTION_SLUG}"][href*="from=history"]`)
      .first();
    await expect(questionLink).toBeVisible({ timeout: 15_000 });

    const href = await questionLink.getAttribute('href');
    expect(href).toBeTruthy();

    // Check if the question was answered incorrectly (reattempt button visible)
    const reattemptButton = page.locator(
      `a[aria-label*="Reattempt"][href*="${QUESTION_SLUG}"]`,
    );
    let hasReattempt = false;
    try {
      await reattemptButton
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
      hasReattempt = true;
    } catch {
      // No reattempt button found after waiting
    }

    // If we couldn't produce an incorrect attempt, skip rather than silently pass
    test.skip(!hasReattempt, 'No reattempt row found — could not verify Bug A');

    // Bug A: incorrect rows should include mode=review but don't
    const reattemptHref = await reattemptButton.first().getAttribute('href');
    expect(reattemptHref).not.toContain('mode=review');

    // Document the bug: this assertion will fail when Bug A is fixed
    // (at which point mode=review should be present on ALL rows)
  });
});
