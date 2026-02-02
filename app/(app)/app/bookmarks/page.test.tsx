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

describe('app/(app)/app/bookmarks', () => {
  it('renders bookmarks', () => {
    const html = renderToStaticMarkup(
      <BookmarksView
        rows={[
          {
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
    expect(html).toContain('q-1');
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

  it('throws when removeBookmarkAction is missing questionId', async () => {
    const formData = new FormData();

    await expect(removeBookmarkAction(formData)).rejects.toThrow(
      'questionId is required',
    );
  });

  it('throws when removeBookmarkAction cannot toggle bookmark', async () => {
    const formData = new FormData();
    formData.set('questionId', 'q_1');

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn: async () => err('INTERNAL_ERROR', 'Boom'),
        revalidatePathFn: vi.fn(),
      }),
    ).rejects.toThrow('Boom');
  });

  it('throws when removeBookmarkAction results in bookmarked=true', async () => {
    const formData = new FormData();
    formData.set('questionId', 'q_1');

    await expect(
      removeBookmarkAction(formData, {
        toggleBookmarkFn: async () => ok({ bookmarked: true }),
        revalidatePathFn: vi.fn(),
      }),
    ).rejects.toThrow('Expected bookmark to be removed');
  });

  it('loads bookmarks via createBookmarksPage', async () => {
    const getBookmarksFn = vi.fn(async () =>
      ok({
        rows: [
          {
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
    expect(html).toContain('q-1');
  });
});
