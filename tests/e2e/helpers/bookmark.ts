import { expect, type Page } from '@playwright/test';

const QUICK_PRACTICE_BASE = '/app/practice/quick';
const BOOKMARKS_PAGE_URL = '/app/bookmarks';
const QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS = 2_000;
const QUICK_PRACTICE_ANSWER_CHOICES_TIMEOUT_MS = 15_000;
const BOOKMARKS_PAGE_STATE_TIMEOUT_MS = 10_000;
const PAGE_NAVIGATION_TIMEOUT_MS = 60_000;
const BOOKMARKS_PAGE_ERROR_RETRY_COUNT = 3;
const BOOKMARKS_PAGE_ERROR_RETRY_DELAY_MS = 500;

type QuickPracticeStatus = 'unanswered' | 'incorrect';
export type BookmarksPageLike = Pick<Page, 'getByRole' | 'getByText'>;
export type BookmarksPageState = 'populated' | 'empty' | 'error';
export type BookmarkableQuestionPageLike = Pick<
  Page,
  'getByRole' | 'getByText'
>;
export type BookmarkableQuestionState = 'bookmark' | 'remove' | 'exhausted';

function toQuickPracticeHref(status: QuickPracticeStatus): string {
  return `${QUICK_PRACTICE_BASE}?status=${status}`;
}

function requireBookmarkableQuestionState(
  state: BookmarkableQuestionState | null,
  timeoutMs: number,
): BookmarkableQuestionState {
  if (state !== null) {
    return state;
  }

  throw new Error(
    `Quick Practice question did not reach a bookmarkable, already-bookmarked, or exhausted state within ${timeoutMs}ms.`,
  );
}

async function hasQuickPracticeQuestion(page: Page): Promise<boolean> {
  const answerChoices = page.getByRole('group', {
    name: 'Answer choices',
  });
  const noMoreQuestionsText = page.getByText('No more questions found.', {
    exact: true,
  });

  try {
    await Promise.race([
      answerChoices.waitFor({
        state: 'visible',
        timeout: QUICK_PRACTICE_ANSWER_CHOICES_TIMEOUT_MS,
      }),
      noMoreQuestionsText.waitFor({
        state: 'visible',
        timeout: QUICK_PRACTICE_ANSWER_CHOICES_TIMEOUT_MS,
      }),
    ]);
  } catch {
    // Fall through to the explicit visibility check below.
  }

  return answerChoices.isVisible().catch(() => false);
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

  await expect(page.getByRole('group', { name: 'Answer choices' })).toBeVisible(
    { timeout: QUICK_PRACTICE_ANSWER_CHOICES_TIMEOUT_MS },
  );
}

export async function ensureBookmarkedQuestion(page: Page): Promise<void> {
  const bookmarkButtonName = /^Bookmark$/;

  await openQuickPracticeQuestion(page);

  const currentState = requireBookmarkableQuestionState(
    await waitForBookmarkableQuestionState(
      page,
      bookmarkButtonName,
      QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS,
    ),
    QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS,
  );
  if (currentState === 'remove') {
    return;
  }

  if (currentState === 'bookmark') {
    await page
      .getByRole('button', { name: bookmarkButtonName })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Remove bookmark' }).first(),
    ).toBeVisible({ timeout: 10_000 });
    return;
  }

  throw new Error('Unable to find a bookmarkable question in practice flow');
}

export async function waitForBookmarkableQuestionState(
  page: BookmarkableQuestionPageLike,
  bookmarkButtonName: string | RegExp,
  timeoutMs = QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS,
): Promise<BookmarkableQuestionState | null> {
  try {
    return await Promise.any([
      page
        .getByRole('button', { name: bookmarkButtonName })
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'bookmark' as const),
      page
        .getByRole('button', { name: 'Remove bookmark' })
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'remove' as const),
      page
        .getByText('No more questions found.', { exact: true })
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'exhausted' as const),
    ]);
  } catch {
    return null;
  }
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
      page
        .getByText('Unable to load bookmarks.', { exact: true })
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => 'error' as const),
    ]);
  } catch (error) {
    throw new Error(
      `Bookmarks page did not reach a populated, empty, or error state within ${timeoutMs}ms.`,
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

async function openBookmarksPageStateWithRetry(
  page: Page,
): Promise<Exclude<BookmarksPageState, 'error'>> {
  for (
    let attempt = 0;
    attempt < BOOKMARKS_PAGE_ERROR_RETRY_COUNT;
    attempt += 1
  ) {
    const state = await openBookmarksPage(page);
    if (state !== 'error') {
      return state;
    }

    if (attempt < BOOKMARKS_PAGE_ERROR_RETRY_COUNT - 1) {
      await page.waitForTimeout(BOOKMARKS_PAGE_ERROR_RETRY_DELAY_MS);
    }
  }

  throw new Error(
    `Bookmarks page rendered its error state ${BOOKMARKS_PAGE_ERROR_RETRY_COUNT} times in a row.`,
  );
}

export async function ensureBookmarkExistsOnBookmarksPage(
  page: Page,
): Promise<void> {
  const initialState = await openBookmarksPageStateWithRetry(page);
  if (initialState === 'populated') {
    return;
  }

  await ensureBookmarkedQuestion(page);
  await expect(openBookmarksPageStateWithRetry(page)).resolves.toBe(
    'populated',
  );
}
