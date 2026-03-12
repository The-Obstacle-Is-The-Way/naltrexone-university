import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { BookmarkRowShell } from './bookmark-row-shell';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function getClickableBookmarkRow() {
  const row = document.querySelector('div.cursor-pointer');

  if (!(row instanceof HTMLDivElement)) {
    throw new Error('Expected clickable bookmark row');
  }

  return row;
}

describe('BookmarksView row activation (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
  });

  it('clicking available row padding navigates to review', async () => {
    const href = '/app/questions/q-1?from=bookmarks&mode=review';

    await render(
      <BookmarkRowShell href={href} className="cursor-pointer">
        <div>Stem for q1</div>
        <button type="button">Remove</button>
      </BookmarkRowShell>,
    );

    getClickableBookmarkRow().dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(pushMock).toHaveBeenCalledWith(href);
  });

  it('clicking Remove does not trigger delegated row navigation', async () => {
    const screen = await render(
      <BookmarkRowShell
        href="/app/questions/q-1?from=bookmarks&mode=review"
        className="cursor-pointer"
      >
        <a href="/app/questions/q-1?from=bookmarks&mode=review">Stem for q1</a>
        <button type="button">Remove</button>
      </BookmarkRowShell>,
    );

    await screen.getByRole('button', { name: 'Remove' }).click();

    expect(pushMock).not.toHaveBeenCalled();
  });
});
