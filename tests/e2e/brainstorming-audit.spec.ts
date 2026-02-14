import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  assertQuestionSlugExists,
  selectChoiceByLabel,
  submitQuestionForOutcome,
} from './helpers/question';
import { ensureSubscribed } from './helpers/subscription';

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

// Imported question with per-choice explanations (for Bug B label desync test)
const IMPORTED_QUESTION_SLUG = 'anton-2006-combine-001';

/** Status filter labels expected on Practice and Quick Practice pages. */
const STATUS_LABELS = ['Unanswered', 'Incorrect', 'Bookmarked'] as const;

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
   * BS-012: Question Status filter on Practice session creation.
   *
   * The Practice page currently has Mode, Count, Difficulty, and Tags —
   * plus a status filter (Unanswered/Incorrect/Bookmarked).
   */
  test('BS-012: Practice page has a question status filter', async ({
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

    // If an incomplete session exists, abandon it first so the session starter form loads.
    const abandonCount = await abandonButton.count();
    if (abandonCount > 0) {
      await abandonButton.click();
      await page.getByRole('button', { name: 'Abandon anyway' }).click();
      await expect(startButton).toBeVisible({ timeout: 10_000 });
    }

    // Verify existing filters are present (so we know the form loaded)
    await expect(
      page.getByRole('button', { name: 'Tutor', exact: true }),
    ).toBeVisible();

    const statusFilter = page.getByRole('group', {
      name: 'Status',
      exact: true,
    });
    await expect(statusFilter).toBeVisible();

    // Assert that question status filter elements are PRESENT.
    for (const label of STATUS_LABELS) {
      await expect(
        statusFilter.getByRole('button', { name: label, exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByText('Leave empty to include all questions', { exact: true }),
    ).toHaveCount(0);
  });

  /**
   * BS-012: Quick Practice has a Question Status filter.
   *
   * Quick Practice immediately serves a random question with no
   * difficulty or tag filtering capabilities.
   */
  test('BS-012: Quick Practice page has a question status filter', async ({
    page,
  }) => {
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

    const statusFilter = page.getByRole('group', {
      name: 'Status',
      exact: true,
    });
    await expect(statusFilter).toBeVisible();

    for (const label of STATUS_LABELS) {
      await expect(
        statusFilter.getByRole('button', { name: label, exact: true }),
      ).toBeVisible();
    }

    // Difficulty filters are still out of scope in v1.
    const absentLabels = ['Difficulty', 'Easy', 'Medium', 'Hard'];
    for (const label of absentLabels) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toHaveCount(0);
    }
  });

  /**
   * BS-011 Bug A: History Questions tab — Incorrect rows omit mode=review.
   *
   * After SPEC-026, History is review-only: all question links include
   * mode=review regardless of correctness.
   */
  test('BS-011 Bug A: History Questions tab incorrect rows include mode=review', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    // Ensure we have an incorrect attempt.
    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Incorrect');

    await page.goto('/app/history?tab=questions&result=incorrect', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Verify the question link includes mode=review.
    const questionLink = page
      .locator(`a[href*="${QUESTION_SLUG}"][href*="from=history"]`)
      .first();
    await expect(questionLink).toBeVisible({ timeout: 15_000 });
    await expect(questionLink).toHaveAttribute('href', /mode=review/);

    const reviewAction = page.locator(
      `a[aria-label^="Review question:"][href^="/app/questions/${QUESTION_SLUG}"]`,
    );
    await expect(reviewAction).toBeVisible({ timeout: 15_000 });
    await expect(reviewAction).toHaveAttribute('href', /mode=review/);

    // Regression: History should not render reattempt links.
    await expect(
      page.locator(
        `a[aria-label^="Reattempt question:"][href^="/app/questions/${QUESTION_SLUG}"]`,
      ),
    ).toHaveCount(0);
  });
});
