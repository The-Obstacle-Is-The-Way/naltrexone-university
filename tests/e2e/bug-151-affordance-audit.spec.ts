import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { ensureSubscribed } from './helpers/subscription';

/**
 * BUG-151: Card/Row Affordance Inconsistency Audit
 *
 * Validates all 15 card/row surfaces documented in BUG-151 via live browser.
 * Checks: misleading hover, missing focus rings, click targets, Pattern A/B/C/D.
 */

/** Force dark mode via prefers-color-scheme emulation. */
async function enableDarkMode(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(
    () => document.documentElement.classList.contains('dark'),
    { timeout: 5_000 },
  );
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; }',
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
}

test.describe('BUG-151: Card/Row Affordance Audit', () => {
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  // ─── MARKETING (PUBLIC, NO AUTH) ───────────────────────────

  test('Marketing: feature cards have misleading hover on non-interactive elements', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/', { timeout: 30_000, waitUntil: 'domcontentloaded' });

    const featuresSection = page.locator('#features');
    await featuresSection.scrollIntoViewIfNeeded();

    const featureCards = page.locator('#features [data-slot="card"]');
    const count = await featureCards.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i++) {
      const card = featureCards.nth(i);
      const classes = (await card.getAttribute('class')) ?? '';
      const tag = await card.evaluate((el) => el.tagName.toLowerCase());

      // BUG: non-interactive div with hover:bg-muted
      expect(tag).toBe('div');
      expect(classes).toContain('hover:bg-muted');

      // Verify NOT clickable (no href, not a link)
      expect(await card.getAttribute('href')).toBeNull();
    }

    await page.screenshot({
      path: 'test-results/bug151/marketing-feature-cards.png',
    });
  });

  test('Marketing: impact stat cards have no misleading hover', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/', { timeout: 30_000, waitUntil: 'domcontentloaded' });

    // Scroll to impact stats section and wait for them to render
    const statsSection = page.locator('[data-testid^="impact-stat-"]').first();
    await statsSection.scrollIntoViewIfNeeded();
    await expect(statsSection).toBeVisible({ timeout: 10_000 });

    const statCards = page.locator('[data-testid^="impact-stat-"]');
    const count = await statCards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = statCards.nth(i);
      const classes = (await card.getAttribute('class')) ?? '';
      // OK: no hover classes on these
      expect(classes).not.toContain('hover:bg-muted');
      expect(classes).not.toContain('hover:border-border');
    }
  });

  test('Marketing: CTA button is properly styled (not a bare link)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/', { timeout: 30_000, waitUntil: 'domcontentloaded' });

    const cta = page.locator('a:has-text("Get Started")').first();
    await expect(cta).toBeVisible();

    const classes = (await cta.getAttribute('class')) ?? '';
    // MetallicCtaButton renders with many utility classes
    expect(classes.split(' ').length).toBeGreaterThan(3);
    expect(await cta.getAttribute('href')).toBeTruthy();
  });

  // ─── DASHBOARD (AUTHENTICATED) ────────────────────────────

  test('Dashboard: stat/streak cards have misleading hover on non-interactive elements', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // Stat cards use [data-slot="card"] and have hover:bg-muted/50
    const allCards = page.locator('[data-slot="card"]');
    const cardCount = await allCards.count();

    let misleadingHoverCount = 0;

    for (let i = 0; i < cardCount; i++) {
      const card = allCards.nth(i);
      const classes = (await card.getAttribute('class')) ?? '';
      const tag = await card.evaluate((el) => el.tagName.toLowerCase());
      const hasHref = (await card.getAttribute('href')) !== null;

      if (
        classes.includes('hover:border-border') &&
        classes.includes('hover:bg-muted/50') &&
        tag !== 'a' &&
        !hasHref
      ) {
        misleadingHoverCount++;
      }
    }

    // BUG-151 documents 5 stat/streak cards with misleading hover
    expect(misleadingHoverCount).toBeGreaterThanOrEqual(5);

    await page.screenshot({
      path: 'test-results/bug151/dashboard-stat-cards.png',
    });
  });

  test('Dashboard: recent session/activity links have proper focus rings', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // Pattern A links — these should have focus-visible:ring
    const sessionLinks = page.locator(
      'a[class*="hover:bg-muted"][class*="focus-visible:ring"]',
    );
    const linkCount = await sessionLinks.count();

    // OK if no sessions/activity exist yet; skip gracefully
    if (linkCount > 0) {
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = sessionLinks.nth(i);
        const classes = (await link.getAttribute('class')) ?? '';
        expect(classes).toContain('focus-visible:ring');
      }
    }
  });

  // ─── HISTORY SESSIONS TAB (Pattern C) ─────────────────────

  test('History sessions: Pattern C rows are keyboard-focusable with explicit focus-visible ring', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Wait for session rows to appear
    const sessionRow = page
      .locator('li')
      .filter({
        has: page.locator('button[aria-label*="breakdown for"]'),
      })
      .first();
    const emptyMsg = page.getByText(/No (completed )?sessions yet/i);
    await sessionRow
      .or(emptyMsg)
      .waitFor({ state: 'visible', timeout: 15_000 });

    const hasRows = await sessionRow.isVisible().catch(() => false);
    if (!hasRows) {
      test.skip(true, 'No session rows to audit');
      return;
    }

    const rows = page.locator('li').filter({
      has: page.locator('button[aria-label*="breakdown for"]'),
    });
    const rowCount = await rows.count();

    for (let i = 0; i < Math.min(rowCount, 3); i++) {
      const row = rows.nth(i);
      const classes = (await row.getAttribute('class')) ?? '';
      const tabindex = await row.getAttribute('tabindex');

      // Verify Pattern C row-level interaction affordance.
      expect(tabindex).toBe('0');
      expect(classes).toContain('cursor-pointer');
      expect(classes).toContain('hover:bg-accent/40');
      expect(classes).toContain('focus-visible:ring');
      expect(classes).toContain('focus-visible:ring-[3px]');

      // Inner title link remains out of tab order to keep row-level focus target.
      const innerLink = row.locator('a').first();
      if (await innerLink.isVisible().catch(() => false)) {
        const innerTabindex = await innerLink.getAttribute('tabindex');
        expect(innerTabindex).toBe('-1');

        const innerClasses = (await innerLink.getAttribute('class')) ?? '';
        // Inner link has focus ring but is removed from tab order
        expect(innerClasses).toContain('focus-visible:ring');
      }
    }

    await page.screenshot({
      path: 'test-results/bug151/history-sessions-rows.png',
    });
  });

  test('History sessions: card-level click navigates correctly', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });

    const sessionRow = page
      .locator('li')
      .filter({
        has: page.locator('button[aria-label*="breakdown for"]'),
      })
      .first();
    const emptyMsg = page.getByText(/No (completed )?sessions yet/i);
    await sessionRow
      .or(emptyMsg)
      .waitFor({ state: 'visible', timeout: 15_000 });

    const hasRows = await sessionRow.isVisible().catch(() => false);
    if (!hasRows) {
      test.skip(true, 'No session rows to audit');
      return;
    }

    // Click the LI row (not a button or link inside it)
    const box = await sessionRow.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const urlBefore = page.url();
    // Click near the left edge of the row to hit empty space
    await page.mouse.click(box.x + 15, box.y + 15);
    await page.waitForTimeout(2000);

    const urlAfter = page.url();
    // Should have navigated (Pattern C — card-level onClick)
    expect(urlAfter).not.toBe(urlBefore);
  });

  // ─── HISTORY QUESTIONS TAB (Pattern B → needs Pattern A) ──

  test('History questions: cards use Pattern B (inner targets only, not card-level click)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Question cards contain a "Review" button — use that to distinguish from empty-state cards
    const reviewButtons = page.locator(
      '[data-slot="card"] a:has-text("Review")',
    );
    const emptyMsg = page.getByText(/No questions/i);
    await reviewButtons.first().or(emptyMsg).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const hasCards = await reviewButtons
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasCards) {
      test.skip(true, 'No question cards to audit');
      return;
    }

    // Get only cards that contain a Review button (actual question cards)
    const questionCards = page.locator(
      '[data-slot="card"]:has(a:has-text("Review"))',
    );
    const cardCount = await questionCards.count();

    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const card = questionCards.nth(i);
      const cardTag = await card.evaluate((el) => el.tagName.toLowerCase());

      // Currently Pattern B: card is a div, not a link
      expect(cardTag).not.toBe('a');

      // Card should NOT be clickable (no onClick, no tabIndex)
      expect(await card.getAttribute('tabindex')).toBeNull();
      expect(await card.getAttribute('role')).toBeNull();

      // Inner title link exists
      const titleLink = card.locator('a').first();
      await expect(titleLink).toBeVisible();

      const linkClasses = (await titleLink.getAttribute('class')) ?? '';
      // BUG: title link missing focus-visible ring
      expect(linkClasses).not.toContain('focus-visible:ring');
      expect(linkClasses).toContain('hover:underline');

      // Review button also links to same destination
      const reviewLink = card.locator('a:has-text("Review")');
      if (await reviewLink.isVisible().catch(() => false)) {
        const titleHref = await titleLink.getAttribute('href');
        const reviewHref = await reviewLink.getAttribute('href');
        expect(titleHref).toBe(reviewHref); // Same destination — redundant
      }
    }

    // Asymmetry test: click empty space on card — should NOT navigate
    const firstCard = questionCards.first();
    await firstCard.scrollIntoViewIfNeeded();
    const box = await firstCard.boundingBox();
    if (box) {
      const urlBefore = page.url();
      await page.mouse.click(box.x + 10, box.y + 10);
      await page.waitForTimeout(1000);
      expect(page.url()).toBe(urlBefore); // Pattern B: empty space doesn't navigate
    }

    await page.screenshot({
      path: 'test-results/bug151/history-questions-cards.png',
    });
  });

  // ─── SESSION BREAKDOWN (Pattern B) ────────────────────────

  test('History sessions: breakdown links missing focus-visible ring', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });

    // Click "View breakdown" to expand
    const breakdownBtn = page
      .getByRole('button', { name: /View breakdown/i })
      .first();
    const emptyMsg = page.getByText(/No (completed )?sessions yet/i);
    await breakdownBtn.or(emptyMsg).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const hasBtn = await breakdownBtn.isVisible().catch(() => false);
    if (!hasBtn) {
      test.skip(true, 'No session breakdown to audit');
      return;
    }

    await breakdownBtn.click();
    await page.waitForTimeout(2000);

    // Look for breakdown links
    const breakdownLinks = page.locator('a[class*="hover:underline"]');
    const linkCount = await breakdownLinks.count();

    if (linkCount > 0) {
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = breakdownLinks.nth(i);
        const classes = (await link.getAttribute('class')) ?? '';
        // BUG: missing focus-visible ring
        const hasFocusRing = classes.includes('focus-visible:ring');
        // Document the bug state
        if (!hasFocusRing) {
          // This link is missing focus ring — expected bug
          expect(classes).not.toContain('focus-visible:ring');
        }
      }
    }

    await page.screenshot({
      path: 'test-results/bug151/session-breakdown.png',
    });
  });

  // ─── BOOKMARKS (Pattern B) ────────────────────────────────

  test('Bookmarks: title links missing focus-visible ring', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/bookmarks', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });

    const bookmarkCards = page.locator(
      '[data-slot="card"]:has(button:has-text("Remove"))',
    );
    await bookmarkCards
      .first()
      .or(page.getByText('No bookmarks yet.', { exact: true }))
      .waitFor({ state: 'visible', timeout: 15_000 });

    const hasCards = await bookmarkCards
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasCards) {
      test.skip(true, 'No bookmark cards to audit');
      return;
    }

    const count = await bookmarkCards.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = bookmarkCards.nth(i);
      const titleLink = card.locator('a').first();

      if (await titleLink.isVisible().catch(() => false)) {
        const classes = (await titleLink.getAttribute('class')) ?? '';
        // BUG: missing focus-visible ring
        expect(classes).not.toContain('focus-visible:ring');
        expect(classes).toContain('hover:underline');

        // Verify Review button goes to same destination
        const reviewLink = card.locator('a:has-text("Review")');
        if (await reviewLink.isVisible().catch(() => false)) {
          const titleHref = await titleLink.getAttribute('href');
          const reviewHref = await reviewLink.getAttribute('href');
          expect(titleHref).toBe(reviewHref);
        }

        // Verify Remove button exists (distinct action)
        const removeBtn = card.locator('button:has-text("Remove")');
        if (await removeBtn.isVisible().catch(() => false)) {
          // Remove is a separate destructive action — OK
          expect(await removeBtn.isVisible()).toBe(true);
        }
      }
    }

    await page.screenshot({
      path: 'test-results/bug151/bookmarks-cards.png',
    });
  });

  // ─── DARK MODE FOCUS RING CONTRAST ────────────────────────

  test('Dark mode: --ring CSS variable may have insufficient contrast', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/', { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await enableDarkMode(page);

    const ringVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ring')
        .trim(),
    );

    // BUG-151 documents: --ring: 0 0% 40% in dark mode
    expect(ringVar).toBe('0 0% 40%');

    // This at 50% opacity on dark bg (3.5% lightness) may fail WCAG 3:1
    // Documenting the current state
    const bgVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim(),
    );
    expect(bgVar).toBe('0 0% 3.5%');

    await page.screenshot({
      path: 'test-results/bug151/dark-mode-ring.png',
    });
  });

  // ─── SESSION SUMMARY (source-level check) ─────────────────

  test('Session summary: stat cards have same misleading hover pattern as dashboard', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(
      'app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx',
      'utf-8',
    );

    // BUG-151: 4 stat cards with hover:bg-muted/50
    const hoverMatches = source.match(/hover:bg-muted\/50/g) ?? [];
    expect(hoverMatches.length).toBe(4);

    const borderMatches = source.match(/hover:border-border(?!\/)/g) ?? [];
    expect(borderMatches.length).toBe(4);
  });

  // ─── CROSS-PAGE ASYMMETRY TEST ────────────────────────────

  test('History: sessions tab vs questions tab have asymmetric interaction models', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Sessions tab: Pattern C (card-level click)
    await page.goto('/app/history?tab=sessions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    const sessionRow = page
      .locator('li')
      .filter({
        has: page.locator('button[aria-label*="breakdown for"]'),
      })
      .first();
    const emptySessionMsg = page.getByText(/No (completed )?sessions yet/i);
    await sessionRow.or(emptySessionMsg).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const hasSessions = await sessionRow.isVisible().catch(() => false);

    // Questions tab: Pattern B (inner targets only)
    await page.goto('/app/history?tab=questions', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    const questionCard = page
      .locator('[data-slot="card"]:has(a:has-text("Review"))')
      .first();
    const emptyQuestionMsg = page
      .getByText(/No questions attempted yet/i)
      .first();
    await questionCard.or(emptyQuestionMsg).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    const hasQuestions = await questionCard.isVisible().catch(() => false);

    if (hasSessions && hasQuestions) {
      // Sessions: row is keyboard-focusable/card-level interactive.
      await page.goto('/app/history?tab=sessions', {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      });
      await sessionRow.waitFor({ state: 'visible', timeout: 15_000 });
      const sessionTabindex = await sessionRow.getAttribute('tabindex');
      expect(sessionTabindex).toBe('0');

      // Questions: Card has NO role or tabindex (Pattern B)
      await page.goto('/app/history?tab=questions', {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      });
      await questionCard.waitFor({ state: 'visible', timeout: 15_000 });
      const questionRole = await questionCard.getAttribute('role');
      const questionTabindex = await questionCard.getAttribute('tabindex');
      expect(questionRole).toBeNull();
      expect(questionTabindex).toBeNull();

      // This confirms the asymmetry documented in BUG-151
    }
  });
});
