// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import {
  type ActionResult,
  err,
  ok,
} from '@/src/adapters/controllers/action-result';
import type {
  BookmarkControllerDeps,
  GetBookmarksOutput,
} from '@/src/adapters/controllers/bookmark-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import {
  FakeAuthGateway,
  FakeGetBookmarksUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
  FakeSubscriptionRepository,
  FakeToggleBookmarkUseCase,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';

const { fixtureQuestion1Id, fixtureQuestionOrphanedId, fixtureUser1Id } =
  vi.hoisted(() => ({
    fixtureQuestion1Id: crypto.randomUUID(),
    fixtureQuestionOrphanedId: crypto.randomUUID(),
    fixtureUser1Id: crypto.randomUUID(),
  }));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

type AvailableBookmarkRow = Extract<
  GetBookmarksOutput['rows'][number],
  { isAvailable: true }
>;

function createAvailableBookmarkRow(
  overrides: Partial<AvailableBookmarkRow> = {},
): AvailableBookmarkRow {
  return {
    isAvailable: true,
    questionId: fixtureQuestion1Id,
    slug: 'q-1',
    stemMd: 'Stem for q1',
    difficulty: 'easy',
    bookmarkedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function createBookmarksSuccessResult(
  rows: GetBookmarksOutput['rows'] = [createAvailableBookmarkRow()],
): ActionResult<GetBookmarksOutput> {
  return ok({ rows });
}

function createGetBookmarksFn(
  result: ActionResult<GetBookmarksOutput> = createBookmarksSuccessResult(),
) {
  return vi.fn(async () => result);
}

type BookmarkActionControllerDeps = BookmarkControllerDeps & {
  toggleBookmarkUseCase: FakeToggleBookmarkUseCase;
};

function createBookmarkActionControllerDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  toggleBookmarkOutput?: { bookmarked: boolean };
}): BookmarkActionControllerDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: fixtureUser1Id,
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const now = new Date('2026-02-01T00:00:00Z');

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId: user?.id ?? fixtureUser1Id,
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  return {
    authGateway: new FakeAuthGateway(user),
    logger: new FakeLogger(),
    rateLimiter: new FakeRateLimiter(),
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(() => now),
    checkEntitlementUseCase: new CheckEntitlementUseCase(
      subscriptionRepository,
      () => now,
    ),
    toggleBookmarkUseCase: new FakeToggleBookmarkUseCase(
      overrides?.toggleBookmarkOutput ?? { bookmarked: false },
    ),
    getBookmarksUseCase: new FakeGetBookmarksUseCase({ rows: [] }),
    now: () => now,
  };
}

let BookmarksView: typeof import('./page').BookmarksView;
let createBookmarksPage: typeof import('./page').createBookmarksPage;
let renderBookmarks: typeof import('./page').renderBookmarks;
let removeBookmarkAction: typeof import('./bookmarks-actions').removeBookmarkAction;
let toggleBookmark: typeof import('@/src/adapters/controllers/bookmark-controller').toggleBookmark;

beforeAll(async () => {
  const [pageModule, actionsModule, bookmarkControllerModule] =
    await Promise.all([
      import('./page'),
      import('./bookmarks-actions'),
      import('@/src/adapters/controllers/bookmark-controller'),
    ]);

  BookmarksView = pageModule.BookmarksView;
  createBookmarksPage = pageModule.createBookmarksPage;
  renderBookmarks = pageModule.renderBookmarks;
  removeBookmarkAction = actionsModule.removeBookmarkAction;
  toggleBookmark = bookmarkControllerModule.toggleBookmark;
});

describe('app/(app)/app/bookmarks', () => {
  it('waits for searchParams before loading bookmarks behind the request boundary', async () => {
    let releaseSearchParams:
      | ((value: {
          error?: string | string[];
          toast?: string | string[];
        }) => void)
      | undefined;
    const getBookmarksFn = createGetBookmarksFn();
    const BookmarksPage = createBookmarksPage({ getBookmarksFn });

    const pagePromise = BookmarksPage({
      searchParams: new Promise((resolve) => {
        releaseSearchParams = resolve;
      }),
    });

    expect(getBookmarksFn).not.toHaveBeenCalled();

    releaseSearchParams?.({});

    const element = await pagePromise;
    const html = renderToStaticMarkup(element);

    expect(getBookmarksFn).toHaveBeenCalledTimes(1);
    expect(html).toContain('Bookmarks');
    expect(html).toContain('Stem for q1');
  });

  it('renders a truncated stem preview as the card title instead of raw slug text', () => {
    const longStem =
      'A very long stem that should be truncated in the card title for readability in bookmarks lists.';
    const expectedPreview = getStemPreview(longStem, 80);
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: true,
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd: longStem,
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain(expectedPreview);
    expect(html).toContain(longStem);
    expect(html).not.toContain('>q-1<');
  });

  it('renders stem description as plain text (no raw markdown syntax)', () => {
    const stemMd = '# Heading with [link](https://example.com) and **bold**';
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: true,
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd,
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('Heading with link and bold');
    expect(html).not.toContain('# Heading');
    expect(html).not.toContain('[link](https://example.com)');
    expect(html).not.toContain('**bold**');
  });

  it('hides body text when stem plain text is short enough to fit the title', () => {
    const stemMd = 'Short stem question about pharmacology';
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: true,
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd,
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body.textContent ?? '';

    const occurrences = text.split(stemMd).length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders available bookmarks as standalone tonal rows with title-link navigation only', () => {
    const reviewHref = toQuestionRoute('q-1', {
      from: 'bookmarks',
      mode: 'review',
    });
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: true,
            questionId: fixtureQuestion1Id,
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const list = doc.querySelector('ul');
    const listTokens = getClassTokens(list?.getAttribute('class') ?? '');
    const bookmarkRow = doc.querySelector('li > div');
    const bookmarkRowTokens = getClassTokens(
      bookmarkRow?.getAttribute('class') ?? '',
    );
    const reviewLink = Array.from(doc.querySelectorAll('a')).find(
      (anchor) => anchor.getAttribute('href') === reviewHref,
    );
    const reviewLinkTokens = getClassTokens(
      reviewLink?.getAttribute('class') ?? '',
    );
    const removeButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Remove',
    );
    const removeButtonTokens = getClassTokens(
      removeButton?.getAttribute('class') ?? '',
    );

    expect(html).toContain('Bookmarks');
    expect(html).toContain('Stem for q1');
    expect(html).toContain('easy');
    expect(html).toContain('Bookmarked Feb 1, 2026');
    expect(html).not.toContain('>Review<');
    expect(html).not.toContain('aria-label="Review question: Stem for q1"');
    expect(html).toContain('Remove');
    expect(html).toContain('aria-label="Remove bookmark: Stem for q1"');
    expect(html).toContain('Go to Practice');
    expect(html).toContain(`href="${ROUTES.APP_PRACTICE}"`);
    expect(listTokens.has('space-y-4')).toBe(true);
    expect(listTokens.has('space-y-3')).toBe(false);
    expect(doc.querySelector('li [data-slot="card"]')).toBeNull();
    expect(bookmarkRowTokens.has('rounded-2xl')).toBe(true);
    expect(bookmarkRowTokens.has('bg-foreground/[0.08]')).toBe(true);
    expect(bookmarkRowTokens.has('p-4')).toBe(true);
    expect(bookmarkRowTokens.has('transition-colors')).toBe(true);
    expect(bookmarkRowTokens.has('hover:bg-foreground/[0.12]')).toBe(true);
    expect(bookmarkRowTokens.has('cursor-pointer')).toBe(true);
    expect(bookmarkRowTokens.has('shadow-sm')).toBe(false);
    expect(bookmarkRowTokens.has('dark:border-foreground/40')).toBe(false);
    expect(reviewLink).not.toBeUndefined();
    expect(reviewLinkTokens.has('hover:underline')).toBe(false);
    expect(reviewLinkTokens.has('ring-focus')).toBe(true);
    expect(removeButtonTokens.has('rounded-full')).toBe(true);
  });

  it('renders an idempotency key field in the remove-bookmark form', () => {
    const html = renderToStaticMarkup(
      <BookmarksView rows={[createAvailableBookmarkRow()]} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const removeForm = doc.querySelector(
      `form#remove-bookmark-${fixtureQuestion1Id}`,
    );
    const questionIdField = removeForm?.querySelector(
      'input[name="questionId"][type="hidden"]',
    );
    const idempotencyKeyField = removeForm?.querySelector(
      'input[name="idempotencyKey"][type="hidden"]',
    );

    expect(questionIdField?.getAttribute('value')).toBe(fixtureQuestion1Id);
    expect(idempotencyKeyField).not.toBeNull();
    expect(idempotencyKeyField?.getAttribute('value')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('renders empty state when no bookmarks exist', () => {
    const html = renderToStaticMarkup(<BookmarksView rows={[]} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const emptyCard = doc.querySelector('[data-slot="card"]');
    const emptyCardTokens = getClassTokens(
      emptyCard?.getAttribute('class') ?? '',
    );

    expect(html).toContain('Bookmarks');
    expect(html).toContain('No bookmarks yet.');
    expect(html).toContain(
      'Bookmark questions as you practice to review them later.',
    );
    expect(html).toContain('Start practicing');
    expect(html).toContain(`href="${ROUTES.APP_PRACTICE}"`);
    expect(emptyCardTokens.has('dark:border-foreground/40')).toBe(false);
  });

  it('renders unavailable bookmarks as static tonal rows without review affordances', () => {
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: false,
            questionId: fixtureQuestionOrphanedId,
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const unavailableRow = doc.querySelector('li > div');
    const unavailableRowTokens = getClassTokens(
      unavailableRow?.getAttribute('class') ?? '',
    );
    const unavailableListItem = doc.querySelector('li');

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Bookmarked Feb 1, 2026');
    expect(html).toContain('Remove');
    expect(unavailableRowTokens.has('rounded-2xl')).toBe(true);
    expect(unavailableRowTokens.has('bg-foreground/[0.08]')).toBe(true);
    expect(unavailableRowTokens.has('p-4')).toBe(true);
    expect(unavailableRowTokens.has('cursor-pointer')).toBe(false);
    expect(unavailableRowTokens.has('transition-colors')).toBe(false);
    expect(html).not.toContain('Review question:');
    expect(unavailableListItem?.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders an error state when bookmarks load fails', () => {
    const element = renderBookmarks({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load bookmarks.');
    expect(html).toContain('Internal error');
    expect(html).toContain('Go to Practice');
  });

  it('renders ok state via renderBookmarks', () => {
    const element = renderBookmarks(
      ok({
        rows: [],
      }),
    );
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Bookmarks');
    expect(html).toContain('No bookmarks yet.');
  });

  it('calls revalidatePath when removeBookmarkAction succeeds', async () => {
    const toggleBookmarkFn = vi.fn(async () => ok({ bookmarked: false }));
    const revalidatePathFn = vi.fn();

    const formData = new FormData();
    formData.set('questionId', fixtureQuestion1Id);

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn,
        revalidatePathFn,
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?toast=bookmark_removed`,
    });

    expect(toggleBookmarkFn).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
    });
    expect(revalidatePathFn).toHaveBeenCalledWith(ROUTES.APP_BOOKMARKS);
  });

  it('passes idempotencyKey from the form data to toggleBookmarkFn', async () => {
    const toggleBookmarkFn = vi.fn(async () => ok({ bookmarked: false }));

    const formData = new FormData();
    formData.set('questionId', fixtureQuestion1Id);
    formData.set('idempotencyKey', '11111111-1111-1111-1111-111111111111');

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn,
        revalidatePathFn: vi.fn(),
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?toast=bookmark_removed`,
    });

    expect(toggleBookmarkFn).toHaveBeenCalledWith({
      questionId: fixtureQuestion1Id,
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('replays the original removal result when duplicate submissions reuse the same idempotency key', async () => {
    const deps = createBookmarkActionControllerDeps({
      toggleBookmarkOutput: { bookmarked: false },
    });
    const revalidatePathFn = vi.fn();
    const questionId = '11111111-1111-1111-1111-111111111111';
    const idempotencyKey = '22222222-2222-2222-2222-222222222222';

    async function submitRemoval() {
      const formData = new FormData();
      formData.set('questionId', questionId);
      formData.set('idempotencyKey', idempotencyKey);

      return removeBookmarkAction(formData, {
        toggleBookmarkFn: (input) => toggleBookmark(input, deps),
        revalidatePathFn,
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      });
    }

    await expect(submitRemoval()).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?toast=bookmark_removed`,
    });
    await expect(submitRemoval()).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?toast=bookmark_removed`,
    });

    expect(deps.toggleBookmarkUseCase.inputs).toEqual([
      {
        userId: fixtureUser1Id,
        questionId,
      },
    ]);
    expect(revalidatePathFn).toHaveBeenCalledTimes(2);
  });

  it('redirects when removeBookmarkAction is missing questionId', async () => {
    const formData = new FormData();

    await expect(
      removeBookmarkAction(formData, {
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?error=missing_question_id`,
    });
  });

  it('redirects when removeBookmarkAction receives empty questionId', async () => {
    const formData = new FormData();
    formData.set('questionId', '');

    await expect(
      removeBookmarkAction(formData, {
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?error=missing_question_id`,
    });
  });

  it('redirects when removeBookmarkAction cannot toggle bookmark', async () => {
    const formData = new FormData();
    formData.set('questionId', fixtureQuestion1Id);

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn: async () => err('INTERNAL_ERROR', 'Boom'),
        revalidatePathFn: vi.fn(),
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?error=toggle_failed`,
    });
  });

  it('redirects when removeBookmarkAction results in bookmarked=true', async () => {
    const formData = new FormData();
    formData.set('questionId', fixtureQuestion1Id);

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn: async () => ok({ bookmarked: true }),
        revalidatePathFn: vi.fn(),
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: `redirect:${ROUTES.APP_BOOKMARKS}?error=remove_failed`,
    });
  });

  it('loads bookmarks via createBookmarksPage', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage();
    const html = renderToStaticMarkup(element);

    expect(getBookmarksFn).toHaveBeenCalledWith({});
    expect(html).toContain('Stem for q1');
  });

  it('renders a banner when redirected back with an error code', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: 'toggle_failed' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark. Please try again.');
    expect(html).toContain('Stem for q1');
  });

  it('renders a banner when redirected back with missing_question_id', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: 'missing_question_id' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark: missing question id.');
    expect(html).toContain('Stem for q1');
  });

  it('renders error banner when error searchParam is an array', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: ['toggle_failed'] }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark. Please try again.');
    expect(html).toContain('Stem for q1');
  });

  it('renders the first matching error when error searchParam has multiple values', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({
        error: ['toggle_failed', 'missing_question_id'],
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark. Please try again.');
    expect(html).not.toContain(
      'Unable to remove bookmark: missing question id.',
    );
  });

  it('renders error banner when error searchParam is an array with missing_question_id', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: ['missing_question_id'] }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark: missing question id.');
    expect(html).toContain('Stem for q1');
  });

  it('renders a banner when redirected back with remove_failed', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: 'remove_failed' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      'Unable to remove bookmark. Please refresh and try again.',
    );
    expect(html).toContain('Stem for q1');
  });

  it('renders error banner when error searchParam is an array with remove_failed', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: ['remove_failed'] }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      'Unable to remove bookmark. Please refresh and try again.',
    );
    expect(html).toContain('Stem for q1');
  });

  it('does not render an error when first error value is invalid even if a later value is valid', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({
        error: ['unknown_code', 'remove_failed'],
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Stem for q1');
    expect(html).not.toContain('Unable to remove bookmark');
  });

  it('renders page without error when toast searchParam is a multi-value array', async () => {
    const getBookmarksFn = createGetBookmarksFn();

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({
        toast: ['bookmark_removed', 'ignored'],
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Stem for q1');
    expect(html).not.toContain('Unable to remove bookmark');
  });

  it('renders an error view when createBookmarksPage fails to load bookmarks', async () => {
    const getBookmarksFn = createGetBookmarksFn(err('INTERNAL_ERROR', 'Boom'));

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load bookmarks.');
    expect(html).toContain('Boom');
  });
});
