import { expect, type Page } from '@playwright/test';

async function isVisible(
  page: Page,
  role: Parameters<Page['getByRole']>[0],
  name: string,
): Promise<boolean> {
  try {
    return await page
      .getByRole(role, { name })
      .first()
      .isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

export async function ensureBookmarkedQuestion(page: Page): Promise<void> {
  await page.goto('/app/practice');
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await isVisible(page, 'button', 'Remove bookmark')) {
      return;
    }

    if (await isVisible(page, 'button', 'Bookmark')) {
      await page.getByRole('button', { name: 'Bookmark' }).first().click();
      await expect(
        page.getByRole('button', { name: 'Remove bookmark' }).first(),
      ).toBeVisible({ timeout: 10_000 });
      return;
    }

    await page.getByRole('button', { name: 'Next Question' }).click();
  }

  throw new Error('Unable to find a bookmarkable question in practice flow');
}

export async function ensureBookmarkExistsOnBookmarksPage(
  page: Page,
): Promise<void> {
  await page.goto('/app/bookmarks');
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();

  const removeButton = page.getByRole('button', { name: 'Remove' }).first();
  if (await removeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    return;
  }

  await ensureBookmarkedQuestion(page);
  await page.goto('/app/bookmarks');
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  await expect(removeButton).toBeVisible();
}
