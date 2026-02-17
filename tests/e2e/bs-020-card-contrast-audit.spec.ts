import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  getComputedBgColor,
  getCssVariables,
  requireLightness,
} from './helpers/color-utils';
import { ensureSubscribed } from './helpers/subscription';

/**
 * BS-020: Card Contrast and Hover Consistency
 *
 * Audits the card hover behavior and background color layering
 * documented in docs/brainstorming/bs-020-card-contrast-and-hover-consistency.md
 *
 * Key claim: Dashboard stat cards using `hover:bg-muted/50` on a
 * `bg-muted` parent cause cards to disappear on hover in dark mode,
 * while landing page cards using `hover:bg-muted` on `bg-background`
 * parent work correctly.
 */

/** Force dark mode via prefers-color-scheme emulation. */
async function enableDarkMode(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
  // Wait for theme to apply
  await page.waitForFunction(
    () => document.documentElement.classList.contains('dark'),
    { timeout: 5_000 },
  );
  // Disable CSS transitions to avoid reading mid-transition computed values.
  // Cards use transition-colors which causes flaky color measurements.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; }',
  });
  // Allow a repaint cycle for styles to settle
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
}

test.describe('BS-020: Card Contrast and Hover Audit', () => {
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('Dark mode CSS variables match documented values', async ({ page }) => {
    test.setTimeout(180_000);
    await signInWithClerkPassword(page);
    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await enableDarkMode(page);

    const vars = await getCssVariables(page);

    // BS-020 documents: --background: 0 0% 3.5%
    expect(vars.background).toBe('0 0% 3.5%');
    // BS-020 documents: --card: 0 0% 7%
    expect(vars.card).toBe('0 0% 7%');
    // BS-020 documents: --muted: 0 0% 11%
    expect(vars.muted).toBe('0 0% 11%');
    // BS-020 documents: --border: 0 0% 15%
    expect(vars.border).toBe('0 0% 15%');
  });

  test('Dashboard: page background is bg-muted, cards lose contrast on hover', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await enableDarkMode(page);

    // BS-020: App layout uses bg-muted (11% lightness)
    const pageBg = await getComputedBgColor(page, '.min-h-screen.bg-muted');
    const pageLightness = requireLightness(pageBg, 'dashboard page background');
    // bg-muted in dark = hsl(0 0% 11%) ≈ rgb(28, 28, 28) ≈ 11% lightness
    expect(pageLightness).toBeGreaterThan(8);
    expect(pageLightness).toBeLessThan(15);

    // Find the first stat card
    const statCard = page.locator('[data-slot="card"]').first();
    await expect(statCard).toBeVisible();

    // Card at rest: bg-card = hsl(0 0% 7%) ≈ rgb(18, 18, 18)
    const cardBgRest = await statCard.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const cardLightnessRest = requireLightness(
      cardBgRest,
      'dashboard rest card',
    );

    // BS-020 KEY CLAIM: card (7%) is DARKER than page bg (11%)
    // This is the contrast inversion — card sinks into the page
    expect(cardLightnessRest).toBeLessThan(pageLightness);

    await page.screenshot({
      path: 'test-results/bs020/dashboard-dark-rest.png',
    });

    // Hover over the card
    await statCard.hover();

    const cardBgHover = await statCard.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const cardLightnessHover = requireLightness(
      cardBgHover,
      'dashboard hover card',
    );

    // BS-020 KEY CLAIM: hover:bg-muted/50 blends toward page bg (11%)
    // The card hover lightness approaches the page background lightness
    // Difference between hover and page bg should be very small
    const hoverVsPageDiff = Math.abs(cardLightnessHover - pageLightness);
    // The card nearly disappears — lightness diff < 5%
    expect(hoverVsPageDiff).toBeLessThan(5);

    await page.screenshot({
      path: 'test-results/bs020/dashboard-dark-hover.png',
    });
  });

  test('Landing page: page background is bg-background, cards have good contrast', async ({
    page,
  }) => {
    // Landing page is public, no auth needed for the page itself
    await page.goto('/', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await enableDarkMode(page);

    // BS-020: Landing uses bg-background (3.5% lightness)
    const pageBg = await getComputedBgColor(page, '.min-h-\\[100dvh\\]');
    let pageLightness =
      pageBg === 'NOT_FOUND'
        ? null
        : requireLightness(pageBg, 'landing page background');

    // If we can't find the landing container by exact class, try body
    if (pageLightness === null) {
      const bodyBg = await getComputedBgColor(page, 'body');
      pageLightness = requireLightness(bodyBg, 'landing body background');
      // bg-background = hsl(0 0% 3.5%) ≈ rgb(9, 9, 9) ≈ 3.5%
      expect(pageLightness).toBeLessThan(8);
    }
    expect(pageLightness).toBeLessThan(8);

    // Find a feature card (in the Features section)
    const featureCard = page.locator('#features [data-slot="card"]').first();

    // Scroll features into view
    const featuresSection = page.locator('#features');
    await featuresSection.scrollIntoViewIfNeeded();
    await expect(featureCard).toBeVisible({ timeout: 10_000 });

    // Card at rest
    const cardBgRest = await featureCard.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const cardLightnessRest = requireLightness(
      cardBgRest,
      'landing feature card rest',
    );

    // BS-020: Card (bg-card 7%) is LIGHTER than landing bg (3.5%)
    // Card pops out — good contrast
    expect(cardLightnessRest).toBeGreaterThan(pageLightness);

    await page.screenshot({
      path: 'test-results/bs020/landing-dark-rest.png',
      fullPage: false,
    });

    // Hover over feature card
    await featureCard.hover();

    const cardBgHover = await featureCard.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const cardLightnessHover = requireLightness(
      cardBgHover,
      'landing feature card hover',
    );

    // BS-020: hover:bg-muted (11%) on bg-background (3.5%) has 7.5% gap
    // Much more visible than dashboard hover
    const hoverVsPageDiff = Math.abs(cardLightnessHover - pageLightness);
    // Visible contrast — lightness diff > 5%
    expect(hoverVsPageDiff).toBeGreaterThan(5);

    await page.screenshot({
      path: 'test-results/bs020/landing-dark-hover.png',
      fullPage: false,
    });
  });

  test('Hover pattern divergence: three different strategies', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    // Capture the actual CSS classes used for hover on each type of card
    // This verifies BS-020's "Inconsistency 2: Hover Pattern Divergence"

    // 1. Dashboard stat card: hover:bg-muted/50
    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    const dashboardCard = page.locator('[data-slot="card"]').first();
    await expect(dashboardCard).toBeVisible();

    const dashboardCardClasses = await dashboardCard.getAttribute('class');
    // BS-020 documents: dashboard stat cards use hover:bg-muted/50
    expect(dashboardCardClasses).toContain('hover:bg-muted/50');
    // BS-020 documents: dashboard stat cards use hover:border-border/80
    expect(dashboardCardClasses).toContain('hover:border-border/80');

    // 2. Dashboard list items: hover:bg-muted/40
    const listItem = page.locator('a[class*="hover:bg-muted"]').first();
    if (await listItem.isVisible().catch(() => false)) {
      const listItemClasses = await listItem.getAttribute('class');
      expect(listItemClasses).toContain('hover:bg-muted/40');
    }

    // 3. Landing feature card: hover:bg-muted (full opacity)
    await page.goto('/', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    const featuresSection = page.locator('#features');
    await featuresSection.scrollIntoViewIfNeeded();

    const featureCard = page.locator('#features [data-slot="card"]').first();
    await expect(featureCard).toBeVisible({ timeout: 10_000 });

    const featureCardClasses = await featureCard.getAttribute('class');
    // BS-020 documents: landing feature cards use hover:bg-muted (full opacity)
    expect(featureCardClasses).toContain('hover:bg-muted');
    // Should NOT contain hover:bg-muted/50 (that's the dashboard pattern)
    expect(featureCardClasses).not.toContain('hover:bg-muted/50');
  });
});
