import { expect, type Page } from '@playwright/test';

const QUICK_PRACTICE_BASE = '/app/practice/quick';
const BOOKMARKS_PAGE_URL = '/app/bookmarks';
const QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS = 2_000;
const BOOKMARKS_PAGE_STATE_TIMEOUT_MS = 10_000;
const PAGE_NAVIGATION_TIMEOUT_MS = 60_000;

type QuickPracticeStatus = 'unanswered' | 'incorrect';
type BookmarksPageLike = Pick<Page, 'getByRole' | 'getByText'>;
export type BookmarksPageState = 'populated' | 'empty';

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
    name: 'Next',
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

export async function openQuickPracticeQuestion(page: Page): Promise<void> {
  const statusesToTry: QuickPracticeStatus[] = ['unanswered', 'incorrect'];
  for (const status of statusesToTry) {
    await page.goto(toQuickPracticeHref(status), {
      timeout: PAGE_NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Quick Practice' }),
    ).toBeVisible();

    if (await hasQuickPracticeQuestion(page)) {
      break;
    }
  }

  await expect(page.getByRole('button', { name: 'Next' }).first()).toBeVisible({
    timeout: 15_000,
  });
}

export async function ensureBookmarkedQuestion(page: Page): Promise<void> {
  const bookmarkButtonName = /^Bookmark$/;

  await openQuickPracticeQuestion(page);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (
      await isButtonVisible(
        page,
        'Remove bookmark',
        QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS,
      )
    ) {
      return;
    }

    if (
      await isButtonVisible(
        page,
        bookmarkButtonName,
        QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS,
      )
    ) {
      await page
        .getByRole('button', { name: bookmarkButtonName })
        .first()
        .click();
      await expect(
        page.getByRole('button', { name: 'Remove bookmark' }).first(),
      ).toBeVisible({ timeout: 10_000 });
      return;
    }

    await page.getByRole('button', { name: 'Next' }).first().click();
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

export async function waitForBookmarksPageState(
  page: BookmarksPageLike,
  timeoutMs = BOOKMARKS_PAGE_STATE_TIMEOUT_MS,
): Promise<BookmarksPageState> {
  try {
    return await Promise.any([
      page
        .getByRole('button', { name: 'Remove' })
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'populated' as const),
      page
        .getByText('No bookmarks yet.', { exact: true })
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'empty' as const),
    ]);
  } catch (error) {
    throw new Error(
      `Bookmarks page did not reach a populated or empty state within ${timeoutMs}ms.`,
      { cause: error },
    );
  }
}

async function openBookmarksPage(page: Page): Promise<BookmarksPageState> {
  await page.goto(BOOKMARKS_PAGE_URL, {
    timeout: PAGE_NAVIGATION_TIMEOUT_MS,
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible({
    timeout: BOOKMARKS_PAGE_STATE_TIMEOUT_MS,
  });
  return waitForBookmarksPageState(page, BOOKMARKS_PAGE_STATE_TIMEOUT_MS);
}

export async function ensureBookmarkExistsOnBookmarksPage(
  page: Page,
): Promise<void> {
  const initialState = await openBookmarksPage(page);
  if (initialState === 'populated') {
    return;
  }

  await ensureBookmarkedQuestion(page);
  await expect(openBookmarksPage(page)).resolves.toBe('populated');
  await expect(
    page.getByRole('button', { name: 'Remove' }).first(),
  ).toBeVisible({
    timeout: BOOKMARKS_PAGE_STATE_TIMEOUT_MS,
  });
}
