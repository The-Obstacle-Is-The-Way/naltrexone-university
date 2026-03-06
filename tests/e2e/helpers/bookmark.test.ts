import { describe, expect, it, vi } from 'vitest';
import {
  type BookmarkableQuestionPageLike,
  type BookmarksPageLike,
  waitForBookmarkableQuestionState,
  waitForBookmarksPageState,
} from './bookmark';

type WaitForOptions = {
  state: 'visible';
  timeout: number;
};

function createWaitable(
  waitForImpl: (options: WaitForOptions) => Promise<void>,
) {
  return {
    waitFor: vi.fn(waitForImpl),
    first() {
      return this;
    },
  };
}

function createBookmarksPage(
  removeButton: ReturnType<typeof createWaitable>,
  emptyState: ReturnType<typeof createWaitable>,
  errorState: ReturnType<typeof createWaitable>,
): BookmarksPageLike {
  return {
    getByRole: vi.fn(() => removeButton),
    getByText: vi.fn((text: string) => {
      if (text === 'No bookmarks yet.') return emptyState;
      if (text === 'Unable to load bookmarks.') return errorState;
      throw new Error(`Unexpected text locator: ${text}`);
    }),
  } as unknown as BookmarksPageLike;
}

function createBookmarkableQuestionPage(
  bookmarkButton: ReturnType<typeof createWaitable>,
  removeButton: ReturnType<typeof createWaitable>,
  exhaustedState: ReturnType<typeof createWaitable>,
): BookmarkableQuestionPageLike {
  return {
    getByRole: vi.fn(
      (_role: 'button', options?: { name?: string | RegExp }) => {
        if (options?.name === 'Remove bookmark') return removeButton;
        return bookmarkButton;
      },
    ),
    getByText: vi.fn((text: string) => {
      if (text === 'No more questions found.') return exhaustedState;
      throw new Error(`Unexpected text locator: ${text}`);
    }),
  } as unknown as BookmarkableQuestionPageLike;
}

describe('bookmark helper page-state detection', () => {
  it('returns populated when a Remove button becomes visible', async () => {
    const removeButton = createWaitable(async () => {});
    const emptyState = createWaitable(async () => {
      throw new Error('No empty state');
    });
    const errorState = createWaitable(async () => {
      throw new Error('No error state');
    });
    const page = createBookmarksPage(removeButton, emptyState, errorState);

    await expect(waitForBookmarksPageState(page, 2_500)).resolves.toBe(
      'populated',
    );
    expect(removeButton.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 2_500,
    });
    expect(emptyState.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 2_500,
    });
    expect(errorState.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 2_500,
    });
  });

  it('returns empty when the empty-state card becomes visible first', async () => {
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const emptyState = createWaitable(async () => {});
    const errorState = createWaitable(async () => {
      throw new Error('No error state');
    });
    const page = createBookmarksPage(removeButton, emptyState, errorState);

    await expect(waitForBookmarksPageState(page, 4_000)).resolves.toBe('empty');
    expect(removeButton.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 4_000,
    });
    expect(emptyState.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 4_000,
    });
    expect(errorState.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 4_000,
    });
  });

  it('returns error when the bookmarks error state is rendered', async () => {
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const emptyState = createWaitable(async () => {
      throw new Error('No empty state');
    });
    const errorState = createWaitable(async () => {});
    const page = createBookmarksPage(removeButton, emptyState, errorState);

    await expect(waitForBookmarksPageState(page, 3_000)).resolves.toBe('error');
  });

  it('throws a descriptive error when neither valid page state appears', async () => {
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const emptyState = createWaitable(async () => {
      throw new Error('No empty state');
    });
    const errorState = createWaitable(async () => {
      throw new Error('No error state');
    });
    const page = createBookmarksPage(removeButton, emptyState, errorState);

    await expect(waitForBookmarksPageState(page, 1_500)).rejects.toThrow(
      'Bookmarks page did not reach a populated, empty, or error state within 1500ms.',
    );
  });
});

describe('bookmark helper question-state detection', () => {
  it('returns exhausted when no more questions are available', async () => {
    const bookmarkButton = createWaitable(async () => {
      throw new Error('No bookmark button');
    });
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const exhaustedState = createWaitable(async () => {});
    const page = createBookmarkableQuestionPage(
      bookmarkButton,
      removeButton,
      exhaustedState,
    );

    await expect(
      waitForBookmarkableQuestionState(page, /^Bookmark$/, 1_200),
    ).resolves.toBe('exhausted');
  });
});
