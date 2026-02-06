// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BookmarksView,
  createBookmarksPage,
  removeBookmarkAction,
  renderBookmarks,
} from '@/app/(app)/app/bookmarks/page';
import { err, ok } from '@/src/adapters/controllers/action-result';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';

describe('app/(app)/app/bookmarks', () => {
  it('renders a truncated stem preview as the card title instead of raw slug text', () => {
    const longStem =
      'A very long stem that should be truncated in the card title for readability in bookmarks lists.';
    const expectedPreview = getStemPreview(longStem, 80);
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
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

  it('renders bookmarks', () => {
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: true,
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('Bookmarks');
    expect(html).toContain('Stem for q1');
    expect(html).toContain('easy');
    expect(html).toContain('Bookmarked 2026-02-01');
    expect(html).toContain('Reattempt');
    expect(html).toContain('/app/questions/q-1');
    expect(html).toContain('Remove');
  });

  it('renders empty state when no bookmarks exist', () => {
    const html = renderToStaticMarkup(<BookmarksView rows={[]} />);

    expect(html).toContain('Bookmarks');
    expect(html).toContain('No bookmarks yet.');
  });

  it('renders unavailable bookmarks without a reattempt link', () => {
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
            isAvailable: false,
            questionId: 'q_orphaned',
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('[Question no longer available]');
    expect(html).toContain('Bookmarked 2026-02-01');
    expect(html).toContain('Remove');
    expect(html).not.toContain('Reattempt');
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
    formData.set('questionId', 'q_1');

    await expect(
      removeBookmarkAction(formData, { toggleBookmarkFn, revalidatePathFn }),
    ).resolves.toBeUndefined();

    expect(toggleBookmarkFn).toHaveBeenCalledWith({ questionId: 'q_1' });
    expect(revalidatePathFn).toHaveBeenCalledWith('/app/bookmarks');
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
      message: 'redirect:/app/bookmarks?error=missing_question_id',
    });
  });

  it('redirects when removeBookmarkAction cannot toggle bookmark', async () => {
    const formData = new FormData();
    formData.set('questionId', 'q_1');

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn: async () => err('INTERNAL_ERROR', 'Boom'),
        revalidatePathFn: vi.fn(),
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/app/bookmarks?error=toggle_failed',
    });
  });

  it('redirects when removeBookmarkAction results in bookmarked=true', async () => {
    const formData = new FormData();
    formData.set('questionId', 'q_1');

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn: async () => ok({ bookmarked: true }),
        revalidatePathFn: vi.fn(),
        redirectFn: (url: string): never => {
          throw new Error(`redirect:${url}`);
        },
      }),
    ).rejects.toMatchObject({
      message: 'redirect:/app/bookmarks?error=remove_failed',
    });
  });

  it('loads bookmarks via createBookmarksPage', async () => {
    const getBookmarksFn = vi.fn(async () =>
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy' as const,
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage();
    const html = renderToStaticMarkup(element);

    expect(getBookmarksFn).toHaveBeenCalledWith({});
    expect(html).toContain('Stem for q1');
  });

  it('renders a banner when redirected back with an error code', async () => {
    const getBookmarksFn = vi.fn(async () =>
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy' as const,
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: 'toggle_failed' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark.');
    expect(html).toContain('Stem for q1');
  });

  it('renders a banner when redirected back with missing_question_id', async () => {
    const getBookmarksFn = vi.fn(async () =>
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy' as const,
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage({
      searchParams: Promise.resolve({ error: 'missing_question_id' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to remove bookmark: missing question id.');
    expect(html).toContain('Stem for q1');
  });

  it('renders a banner when redirected back with remove_failed', async () => {
    const getBookmarksFn = vi.fn(async () =>
      ok({
        rows: [
          {
            isAvailable: true,
            questionId: 'q_1',
            slug: 'q-1',
            stemMd: 'Stem for q1',
            difficulty: 'easy' as const,
            bookmarkedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    );

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

  it('renders an error view when createBookmarksPage fails to load bookmarks', async () => {
    const getBookmarksFn = vi.fn(async () => err('INTERNAL_ERROR', 'Boom'));

    const BookmarksPage = createBookmarksPage({ getBookmarksFn });
    const element = await BookmarksPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unable to load bookmarks.');
    expect(html).toContain('Boom');
  });
});
