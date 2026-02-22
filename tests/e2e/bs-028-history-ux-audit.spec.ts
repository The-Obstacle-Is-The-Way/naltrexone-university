import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { getComputedBgColor, requireLightness } from './helpers/color-utils';
import { selectChoiceByLabel } from './helpers/question';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

/**
 * BS-027 / BS-028: History Page UX Audit
 *
 * Comprehensive Playwright audit that programmatically verifies the 14 findings
 * documented in BS-028 and the tab bar visual inconsistency from BS-027.
 *
 * This audit captures evidence that code-only analysis and manual inspection
 * cannot: computed styles, rendered dimensions, ARIA attributes, actual data
 * values, hover contrast deltas, and scroll positions.
 */

/** Force dark mode via prefers-color-scheme emulation (from BS-020 pattern). */
async function enableDarkMode(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(
    () => document.documentElement.classList.contains('dark'),
    { timeout: 5_000 },
  );
  // Disable CSS transitions to avoid reading mid-transition computed values.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; }',
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
}

/** Navigate to History Sessions tab and wait for content. */
async function goToHistorySessions(page: Page): Promise<void> {
  await page.goto('/app/history?tab=sessions', {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  // Wait for session list or empty state
  const sessionCard = getFirstSessionCard(page);
  const emptyMessage = page.getByText(/No (completed )?sessions yet/i);
  await sessionCard.or(emptyMessage).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

function getFirstSessionCard(page: Page) {
  return page
    .getByRole('button', { name: /(View|Hide) breakdown/i })
    .first()
    .locator('xpath=ancestor::li[1]');
}

/** Navigate to History Questions tab and wait for content. */
async function goToHistoryQuestions(page: Page): Promise<void> {
  await page.goto('/app/history?tab=questions', {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  // Wait for question list or empty state
  const questionCard = page.locator('[data-slot="card"]').first();
  const emptyMessage = page.getByText(/No questions attempted yet/i);
  await questionCard.or(emptyMessage).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

test.describe('BS-028: History Page UX Audit', () => {
  // Multi-page audit flows can exceed the default timeout due to sequential navigation and assertions in CI.
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  // ─── P0: Critical ─────────────────────────────────────────────────────

  test('P0-1: Tutor mode score denominator uses questionCount, not answered', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Create a tutor session with 2 questions, answer only 1, then end session
    await startSession(page, 'tutor', 2);
    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/).first()).toBeVisible({
      timeout: 10_000,
    });
    // End session WITHOUT answering question 2
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to History Sessions tab
    await goToHistorySessions(page);

    // Find the most recent session card
    const firstSessionCard = getFirstSessionCard(page);
    await expect(firstSessionCard).toBeVisible();
    const cardText = await firstSessionCard.textContent();

    // BS-028 P0-1: The score should show X/2 (questionCount), NOT X/1 (answered).
    // Asserts the fixed behavior: denominator equals questionCount.
    const scoreMatch = cardText?.match(/(\d+)\/(\d+)\s+correct/);
    expect(scoreMatch).toBeTruthy();
    if (scoreMatch) {
      const denominator = Number(scoreMatch[2]);
      expect(
        denominator,
        `BS-028 P0-1: Score denominator should be questionCount (2), got ${denominator}.`,
      ).toBe(2);
    }
  });

  test('P0-2: Session durations are capped at a reasonable maximum', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistorySessions(page);

    // Collect all visible duration values
    const durations = await page.evaluate(() => {
      const sessionCards = Array.from(document.querySelectorAll('li')).filter(
        (card) => card.querySelector('button[aria-label*="breakdown for"]'),
      );
      const results: { text: string; minutes: number }[] = [];

      for (const card of sessionCards) {
        const text = card.textContent ?? '';
        // Match patterns like "42s", "3m 15s", "1403m 51s"
        const durationMatch = text.match(/(\d+)m\s*(?:\d+s)?/);
        if (durationMatch) {
          results.push({
            text: durationMatch[0],
            minutes: Number(durationMatch[1]),
          });
        }
      }
      return results;
    });

    // BS-028 P0-2: No session should display > 120 minutes.
    // Anything above this is almost certainly a timer bug (tab left open).
    const absurdSessions = durations.filter((d) => d.minutes > 120);
    expect(
      absurdSessions,
      `BS-028 P0-2: Found ${absurdSessions.length} session(s) with absurd durations (>120m): ` +
        absurdSessions.map((d) => d.text).join(', '),
    ).toHaveLength(0);
  });

  // ─── P1: Significant ──────────────────────────────────────────────────

  test('P1-3: Questions tab review includes navigator (parity with Sessions)', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Navigate to History Questions tab
    await goToHistoryQuestions(page);

    const questionLink = page.locator('a[href*="/app/questions/"]').first();
    const noQuestions = page.getByText(/No questions attempted yet/i);
    await questionLink.or(noQuestions).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    if (await noQuestions.isVisible().catch(() => false)) {
      test.skip(true, 'No attempted questions in history — cannot verify');
      return;
    }

    // Click a question from Questions tab
    await questionLink.click();
    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // BS-028 P1-3: Questions tab review should have a navigator
    // CURRENT (before fix): no navigator, no Previous/Next, no "Question X of Y"
    // EXPECTED (after fix): navigator with at least Previous/Next through filtered results
    const hasNavigator =
      (await page
        .getByText('Question navigator')
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(/Question \d+ of \d+/)
        .isVisible()
        .catch(() => false));

    // Also check for Previous/Next links
    const hasPrevNext =
      (await page
        .getByText('← Previous')
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText('Next →')
        .isVisible()
        .catch(() => false));

    // Documenting current state — this should pass when the parity fix lands
    expect(
      hasNavigator || hasPrevNext,
      'BS-028 P1-3: Questions tab review should have a navigator or Previous/Next navigation. ' +
        'Currently missing — questions opened from the Questions tab render in standalone mode.',
    ).toBe(true);
  });

  test('P1-4: Session card is clickable with correct affordances', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistorySessions(page);

    const firstSessionLi = getFirstSessionCard(page);
    await expect(firstSessionLi).toBeVisible();

    // BS-028 P1-4: Session card should be clickable
    // Check for interactive affordances on the card or its header
    const cardInteractivity = await firstSessionLi.evaluate((li) => {
      const computedStyle = getComputedStyle(li);
      return {
        cursor: computedStyle.cursor,
        role: li.getAttribute('role'),
        tabIndex: li.getAttribute('tabindex'),
        hasOnClick: li.onclick !== null,
        // Check if there's a link wrapping the session summary text
        hasHeaderLink: li.querySelector('a') !== null,
        hasHeaderButton:
          li.querySelector('button:not([class*="View breakdown"])') !== null,
      };
    });

    // EXPECTED (after fix): The card or its header should be interactive
    // CURRENT (before fix): cursor: auto, no role, no tabindex, no link
    expect(
      cardInteractivity.cursor === 'pointer' ||
        cardInteractivity.role === 'button' ||
        cardInteractivity.role === 'link' ||
        cardInteractivity.hasHeaderLink,
      `BS-028 P1-4: Session card lacks clickable affordance. ` +
        `cursor=${cardInteractivity.cursor}, role=${cardInteractivity.role}, ` +
        `tabIndex=${cardInteractivity.tabIndex}, hasHeaderLink=${cardInteractivity.hasHeaderLink}`,
    ).toBe(true);
  });

  test('P1-5: Breakdown panel has a "Review session" action', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistorySessions(page);

    // Click "View breakdown" on first session
    const viewBreakdownButton = page
      .getByRole('button', { name: /View breakdown/i })
      .first();
    await expect(viewBreakdownButton).toBeVisible({ timeout: 15_000 });
    await viewBreakdownButton.click();

    // Wait for breakdown links
    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 15_000 });

    // BS-028 P1-5: There should be a "Review session" button/link in the breakdown
    const reviewSessionAction = page.getByRole('link', {
      name: /Review session/i,
    });
    const reviewAllAction = page.getByRole('link', { name: /Review all/i });
    const startReviewAction = page.getByRole('link', {
      name: /Start review/i,
    });

    const hasReviewAction =
      (await reviewSessionAction.isVisible().catch(() => false)) ||
      (await reviewAllAction.isVisible().catch(() => false)) ||
      (await startReviewAction.isVisible().catch(() => false));

    expect(
      hasReviewAction,
      'BS-028 P1-5: Breakdown panel should have a "Review session" action to enter ' +
        'the full session review navigator. Currently only per-question links exist.',
    ).toBe(true);
  });

  test('P1-6: Dark mode hover states have sufficient contrast', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistorySessions(page);
    await enableDarkMode(page);

    // Get page background color
    const pageBg = await getComputedBgColor(
      page,
      '.min-h-screen.bg-background',
    );
    const _pageLightness = requireLightness(pageBg, 'page background');

    // Get "View breakdown" button colors at rest vs hover
    const viewBreakdownButton = page
      .getByRole('button', { name: /View breakdown/i })
      .first();
    await expect(viewBreakdownButton).toBeVisible({ timeout: 15_000 });

    const restBg = await viewBreakdownButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const restLightness = requireLightness(restBg, 'button rest');

    await viewBreakdownButton.hover();
    // Allow hover state to settle
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

    const hoverBg = await viewBreakdownButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const hoverLightness = requireLightness(hoverBg, 'button hover');

    // BS-028 P1-6: Hover should produce a visible contrast change (>5% lightness delta)
    const hoverDelta = Math.abs(hoverLightness - restLightness);
    expect(
      hoverDelta,
      `BS-028 P1-6: "View breakdown" button hover contrast too low. ` +
        `rest=${restLightness.toFixed(1)}%, hover=${hoverLightness.toFixed(1)}%, ` +
        `delta=${hoverDelta.toFixed(1)}% (need >5%)`,
    ).toBeGreaterThan(5);

    // Also verify session card hover (should have cursor: pointer)
    const firstSessionLi = getFirstSessionCard(page);
    await firstSessionLi.hover();
    const cardCursor = await firstSessionLi.evaluate(
      (el) => getComputedStyle(el).cursor,
    );
    expect(
      cardCursor,
      'BS-028 P1-6: Session card should show pointer cursor on hover',
    ).toBe('pointer');

    await page.screenshot({
      path: 'test-results/bs028/history-dark-hover.png',
    });
  });

  // ─── P2: Moderate ─────────────────────────────────────────────────────

  test('P2-8: Sessions tab has filters and pagination counts', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistorySessions(page);

    // BS-028 P2-8: Sessions tab should have at least a Type filter and count
    const typeFilter = page
      .locator('select[name="type"]')
      .or(page.getByRole('combobox', { name: /type/i }));
    const showingText = page.getByText(/Showing \d+–\d+ of \d+/);

    const hasTypeFilter = await typeFilter.isVisible().catch(() => false);
    const hasCount = await showingText.isVisible().catch(() => false);

    expect(
      hasTypeFilter || hasCount,
      'BS-028 P2-8: Sessions tab should have filters or pagination counts. ' +
        'Currently bare "Previous"/"Next" text links with no context.',
    ).toBe(true);
  });

  test('P2-9: Only one "Back to History" link on review page', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistorySessions(page);

    // Open a breakdown and click a question
    const viewBreakdownButton = page
      .getByRole('button', { name: /View breakdown/i })
      .first();
    await expect(viewBreakdownButton).toBeVisible({ timeout: 15_000 });
    await viewBreakdownButton.click();

    const breakdownLink = page.locator('a[href*="/app/questions/"]').first();
    await expect(breakdownLink).toBeVisible({ timeout: 15_000 });
    await breakdownLink.click();

    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    // BS-028 P2-9: Should have exactly one "Back to History" link
    const backToHistoryLinks = page.getByRole('link', {
      name: 'Back to History',
    });
    const count = await backToHistoryLinks.count();
    expect(
      count,
      `BS-028 P2-9: Found ${count} "Back to History" links (expected 1). ` +
        'Dual links with different styling create confusion.',
    ).toBe(1);
  });

  test('P2-14: Filter dropdowns use design system Select (not native)', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistoryQuestions(page);
    await enableDarkMode(page);

    // BS-028 P2-14: Filter dropdowns should use shadcn/ui Select, not native <select>
    const nativeSelects = page.locator(
      'form[method="get"] select, form select',
    );
    const nativeSelectCount = await nativeSelects.count();

    if (nativeSelectCount > 0) {
      // Inspect the defects on the native selects
      const defects = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        const results: Record<string, unknown>[] = [];

        for (const select of selects) {
          const computed = getComputedStyle(select);
          results.push({
            name: select.name,
            height: computed.height,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            lineHeight: computed.lineHeight,
            appearance: computed.appearance,
            backgroundColor: computed.backgroundColor,
            paddingRight: computed.paddingRight,
          });
        }
        return results;
      });

      // Check the Apply button height for comparison
      const applyButton = page.getByRole('button', { name: 'Apply' }).first();
      const applyHeight = await applyButton.evaluate(
        (el) => getComputedStyle(el).height,
      );

      // Document the defects
      for (const defect of defects) {
        // Height mismatch: selects should match Apply button height
        expect(
          defect.height,
          `BS-028 P2-14: Select "${defect.name}" height (${defect.height}) should match ` +
            `Apply button height (${applyHeight})`,
        ).toBe(applyHeight);

        // Font weight should be 500 (design system standard)
        expect(
          defect.fontWeight,
          `BS-028 P2-14: Select "${defect.name}" has font-weight ${defect.fontWeight} ` +
            '(expected 500 for design system consistency)',
        ).toBe('500');

        // appearance: none should be set
        expect(
          defect.appearance,
          `BS-028 P2-14: Select "${defect.name}" has appearance: ${defect.appearance} ` +
            '(expected "none" to suppress OS chrome)',
        ).toBe('none');
      }

      await page.screenshot({
        path: 'test-results/bs028/questions-filter-defects.png',
      });
    }

    // Ideal state: no native selects, using Radix-based Select components
    expect(
      nativeSelectCount,
      `BS-028 P2-14: Found ${nativeSelectCount} native <select> elements. ` +
        'These should be replaced with shadcn/ui Select components.',
    ).toBe(0);
  });

  // ─── P3: Minor ────────────────────────────────────────────────────────

  test('P3-10: No duplicate "Other" entries in tag filter', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistoryQuestions(page);

    // BS-028 P3-10: Tag dropdown should not have duplicate "Other" labels
    const tagSelect = page.locator('select[name="tag"]');
    if (await tagSelect.isVisible().catch(() => false)) {
      const optionLabels = await tagSelect.evaluate((select) => {
        const options = Array.from(
          (select as HTMLSelectElement).querySelectorAll('option'),
        );
        return options.map((opt) => opt.textContent?.trim() ?? '');
      });

      const otherEntries = optionLabels.filter((label) => label === 'Other');
      expect(
        otherEntries.length,
        `BS-028 P3-10: Found ${otherEntries.length} "Other" entries in tag filter ` +
          '(expected ≤1). Duplicate comes from Substance vs Treatment tag kinds.',
      ).toBeLessThanOrEqual(1);
    }

    // If using Radix Select, check for duplicates in a different way
    const radixTagTrigger = page.getByRole('combobox', { name: /tag/i });
    if (await radixTagTrigger.isVisible().catch(() => false)) {
      await radixTagTrigger.click();
      const otherItems = page.getByRole('option', { name: 'Other' });
      const otherCount = await otherItems.count();
      expect(
        otherCount,
        `BS-028 P3-10: Found ${otherCount} "Other" options in tag dropdown (expected ≤1)`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test('P3-12: Questions tab has sort controls', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await goToHistoryQuestions(page);

    // BS-028 P3-12: Questions tab should have a sort control
    const sortSelect = page
      .locator('select[name="sort"]')
      .or(page.getByRole('combobox', { name: /sort/i }));
    const sortButton = page.getByRole('button', { name: /sort/i });

    const hasSortControl =
      (await sortSelect.isVisible().catch(() => false)) ||
      (await sortButton.isVisible().catch(() => false));

    expect(
      hasSortControl,
      'BS-028 P3-12: Questions tab should have a sort control. ' +
        'Currently no way to sort by difficulty, result, or recency.',
    ).toBe(true);
  });
});

test.describe('BS-027: Tab Bar Visual Consistency Audit', () => {
  // Multi-page audit flows can exceed the default timeout due to sequential navigation and assertions in CI.
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('History tab bar active state matches SegmentedControl active state', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Navigate to History page (has HistoryTabBar)
    await goToHistorySessions(page);
    await enableDarkMode(page);

    // Find the active tab (Sessions or Questions, whichever is active)
    const activeTab = page.locator('nav a[aria-current="page"]').first();
    await expect(activeTab).toBeVisible();

    const historyActiveStyles = await activeTab.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        borderRadius: computed.borderRadius,
        boxShadow: computed.boxShadow,
      };
    });
    const historyActiveLightness = requireLightness(
      historyActiveStyles.backgroundColor,
      'history tab active bg',
    );

    // Navigate to Practice page (has SegmentedControl)
    await page.goto('/app/practice', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await enableDarkMode(page);

    // Wait for session starter to load
    const startButton = page.getByRole('button', { name: 'Start session' });
    const abandonButton = page.getByRole('button', {
      name: 'Abandon session',
    });
    await startButton.or(abandonButton).waitFor({ state: 'visible' });

    // Find the active segmented control button (Tutor or Exam, whichever is pressed)
    const activeSegment = page.locator('button[aria-pressed="true"]').first();
    await expect(activeSegment).toBeVisible();

    const segmentActiveStyles = await activeSegment.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        borderRadius: computed.borderRadius,
        boxShadow: computed.boxShadow,
      };
    });
    const segmentActiveLightness = requireLightness(
      segmentActiveStyles.backgroundColor,
      'segmented control active bg',
    );

    // BS-027: The active state colors should be similar.
    // HistoryTabBar uses bg-background (3.5% lightness — dark, nearly invisible)
    // SegmentedControl uses bg-primary (white/bright — clearly visible)
    // The delta should be small if they're unified.
    const activeBgDelta = Math.abs(
      historyActiveLightness - segmentActiveLightness,
    );

    expect(
      activeBgDelta,
      `BS-027: History tab active bg lightness (${historyActiveLightness.toFixed(1)}%) ` +
        `vs SegmentedControl active bg lightness (${segmentActiveLightness.toFixed(1)}%). ` +
        `Delta=${activeBgDelta.toFixed(1)}% — should be <10% for visual consistency.`,
    ).toBeLessThan(10);

    // Navigate back to history for the container check
    await goToHistorySessions(page);
    await enableDarkMode(page);

    const historyContainerClasses =
      (await page.locator('nav').first().getAttribute('class')) ?? '';
    // BS-027: HistoryTabBar uses rounded-full, SegmentedControl uses rounded-lg
    // After unification, both should use the same border-radius
    const historyUsesRoundedFull =
      historyContainerClasses.includes('rounded-full');

    await page.screenshot({
      path: 'test-results/bs027/history-tab-bar-dark.png',
    });

    // Document findings
    expect(
      historyUsesRoundedFull,
      'BS-027: HistoryTabBar still uses rounded-full (pill shape). ' +
        'After SPEC-037 unification, both should share the same shape tokens.',
    ).toBe(false);
  });
});
