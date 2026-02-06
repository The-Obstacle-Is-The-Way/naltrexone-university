import { expect, type Page } from '@playwright/test';

async function isButtonVisible(
  page: Page,
  name: string,
  timeout: number,
): Promise<boolean> {
  try {
    await page
      .getByRole('button', { name })
      .first()
      .waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

export async function ensureBookmarkedQuestion(page: Page): Promise<void> {
  await page.goto('/app/practice');
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await isButtonVisible(page, 'Remove bookmark', 500)) {
      return;
    }

    if (await isButtonVisible(page, 'Bookmark', 500)) {
      await page.getByRole('button', { name: 'Bookmark' }).first().click();
      await expect(
        page.getByRole('button', { name: 'Remove bookmark' }).first(),
      ).toBeVisible({ timeout: 10_000 });
      return;
    }

    await page.getByRole('button', { name: 'Next Question' }).click();
    await Promise.race([
      page
        .getByRole('button', { name: 'Bookmark' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 }),
      page
        .getByRole('button', { name: 'Remove bookmark' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 }),
    ]).catch(() => undefined);
  }

  throw new Error('Unable to find a bookmarkable question in practice flow');
}

export async function ensureBookmarkExistsOnBookmarksPage(
  page: Page,
): Promise<void> {
  await page.goto('/app/bookmarks');
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();

  const removeButton = page.getByRole('button', { name: 'Remove' }).first();
  try {
    await removeButton.waitFor({ state: 'visible', timeout: 1_000 });
    return;
  } catch {
    // No existing bookmarks — create one
  }

  await ensureBookmarkedQuestion(page);
  await page.goto('/app/bookmarks');
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  await expect(removeButton).toBeVisible();
}
