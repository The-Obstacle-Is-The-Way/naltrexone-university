// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BookmarksView, renderBookmarks } from './page';

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
});
