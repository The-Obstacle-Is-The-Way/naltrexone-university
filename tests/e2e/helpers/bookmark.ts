import { expect, type Page } from '@playwright/test';

const QUICK_PRACTICE_BASE = '/app/practice/quick';

type QuickPracticeStatus = 'unanswered' | 'incorrect';

function toQuickPracticeHref(status: QuickPracticeStatus): string {
  return `${QUICK_PRACTICE_BASE}?status=${status}`;
}

async function isButtonVisible(
  page: Page,
  name: string | RegExp,
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

async function hasQuickPracticeQuestion(page: Page): Promise<boolean> {
  const nextQuestionButton = page.getByRole('button', {
    name: 'Next Question',
  });
  const noMoreQuestionsText = page.getByText('No more questions found.', {
    exact: true,
  });

  try {
    await Promise.race([
      nextQuestionButton.first().waitFor({ state: 'visible', timeout: 15_000 }),
      noMoreQuestionsText.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
  } catch {
    // Fall through to the explicit visibility check below.
  }

  return nextQuestionButton
    .first()
    .isVisible()
    .catch(() => false);
}

export async function ensureBookmarkedQuestion(page: Page): Promise<void> {
  const bookmarkButtonName = /^Bookmark$/;

  const statusesToTry: QuickPracticeStatus[] = ['unanswered', 'incorrect'];
  for (const status of statusesToTry) {
    await page.goto(toQuickPracticeHref(status), {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Quick Practice' }),
    ).toBeVisible();

    if (await hasQuickPracticeQuestion(page)) {
      break;
    }
  }

  await expect(
    page.getByRole('button', { name: 'Next Question' }).first(),
  ).toBeVisible({ timeout: 15_000 });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await isButtonVisible(page, 'Remove bookmark', 500)) {
      return;
    }

    if (await isButtonVisible(page, bookmarkButtonName, 500)) {
      await page
        .getByRole('button', { name: bookmarkButtonName })
        .first()
        .click();
      await expect(
        page.getByRole('button', { name: 'Remove bookmark' }).first(),
      ).toBeVisible({ timeout: 10_000 });
      return;
    }

    await page.getByRole('button', { name: 'Next Question' }).first().click();
    await Promise.race([
      page
        .getByRole('button', { name: bookmarkButtonName })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 }),
      page
        .getByRole('button', { name: 'Remove bookmark' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 }),
      page
        .getByText('No more questions found.', { exact: true })
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
