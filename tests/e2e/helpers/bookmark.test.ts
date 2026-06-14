import { beforeAll, describe, expect, it, vi } from 'vitest';

type WaitForOptions = {
  state: 'visible';
  timeout?: number;
};

type VisibilityLocator = {
  click: ReturnType<typeof vi.fn>;
  first: () => VisibilityLocator;
  isVisible: ReturnType<typeof vi.fn>;
  waitFor: ReturnType<typeof vi.fn>;
};

type FakePageState = 'bookmark' | 'remove' | 'exhausted' | 'loading';
type FakeBookmarksPageState = 'populated' | 'empty' | 'error';

vi.mock('@playwright/test', () => ({
  expect: (target: unknown) => ({
    async toBeVisible(options?: { timeout?: number }) {
      const waitable = target as {
        waitFor?: (options: WaitForOptions) => Promise<void>;
      };
      if (typeof waitable?.waitFor !== 'function') {
        throw new Error('Expected a locator-like target with waitFor().');
      }

      await waitable.waitFor({
        state: 'visible',
        ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
      });
    },
    resolves: {
      async toBe(expected: unknown) {
        const resolved = await target;
        if (!Object.is(resolved, expected)) {
          throw new Error(
            `Expected resolved value ${String(expected)}, received ${String(resolved)}.`,
          );
        }
      },
    },
  }),
}));

let ensureBookmarkedQuestion: typeof import('./bookmark').ensureBookmarkedQuestion;
let ensureBookmarkExistsOnBookmarksPage: typeof import('./bookmark').ensureBookmarkExistsOnBookmarksPage;
let openQuickPracticeQuestion: typeof import('./bookmark').openQuickPracticeQuestion;
let waitForBookmarkableQuestionState: typeof import('./bookmark').waitForBookmarkableQuestionState;
let waitForBookmarksPageState: typeof import('./bookmark').waitForBookmarksPageState;
type BookmarkableQuestionPageLike =
  import('./bookmark').BookmarkableQuestionPageLike;
type BookmarksPageLike = import('./bookmark').BookmarksPageLike;

beforeAll(async () => {
  ({
    ensureBookmarkedQuestion,
    ensureBookmarkExistsOnBookmarksPage,
    openQuickPracticeQuestion,
    waitForBookmarkableQuestionState,
    waitForBookmarksPageState,
  } = await import('./bookmark'));
});

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
    getByRole: vi.fn((role: string, options?: { name?: string }) => {
      if (role === 'button' && options?.name === 'Remove') {
        return removeButton;
      }

      throw new Error(
        `Unexpected role locator: ${role} (${String(options?.name)})`,
      );
    }),
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
    getByRole: vi.fn((role: string, options?: { name?: string | RegExp }) => {
      if (role !== 'button') {
        throw new Error(`Unexpected role locator: ${role}`);
      }

      if (options?.name === 'Remove bookmark') return removeButton;
      if (options?.name instanceof RegExp) return bookmarkButton;
      throw new Error(`Unexpected button name: ${String(options?.name)}`);
    }),
    getByText: vi.fn((text: string) => {
      if (text === 'No more questions found.') return exhaustedState;
      throw new Error(`Unexpected text locator: ${text}`);
    }),
  } as unknown as BookmarkableQuestionPageLike;
}

function createVisibilityLocator(
  isVisible: () => boolean,
  onClick?: () => void,
): VisibilityLocator {
  const locator: VisibilityLocator = {
    click: vi.fn(async () => {
      if (!isVisible()) {
        throw new Error('Locator is not visible.');
      }

      onClick?.();
    }),
    first: () => locator,
    isVisible: vi.fn(async () => isVisible()),
    waitFor: vi.fn(async ({ state }: WaitForOptions) => {
      if (state !== 'visible') {
        throw new Error(`Unsupported waitFor state: ${state}`);
      }

      if (!isVisible()) {
        throw new Error('Locator did not become visible.');
      }
    }),
  };

  return locator;
}

function createFakeInteractivePage(options: {
  unansweredStates?: FakePageState[];
  incorrectStates?: FakePageState[];
  bookmarksPageStates?: FakeBookmarksPageState[];
}) {
  const quickStates = {
    incorrect: options.incorrectStates ?? ['bookmark'],
    unanswered: options.unansweredStates ?? ['bookmark'],
  } satisfies Record<'incorrect' | 'unanswered', FakePageState[]>;
  const bookmarksPageStates = [...(options.bookmarksPageStates ?? [])];

  let bookmarkCreated = false;
  let bookmarkVisitCount = 0;
  let currentRoute = '';
  let currentQuickStatus: 'incorrect' | 'unanswered' | null = null;
  let currentQuickIndex = 0;
  const locatorCache = new Map<string, VisibilityLocator>();

  function getCurrentQuickState(): FakePageState {
    if (!currentQuickStatus) {
      return 'loading';
    }

    return quickStates[currentQuickStatus][currentQuickIndex] ?? 'exhausted';
  }

  function getCurrentBookmarksPageState(): FakeBookmarksPageState {
    const explicitState = bookmarksPageStates[bookmarkVisitCount - 1];
    if (explicitState) {
      return explicitState;
    }

    return bookmarkCreated ? 'populated' : 'empty';
  }

  function parseQuickPracticeStatus(
    url: string,
  ): 'incorrect' | 'unanswered' | null {
    if (url === '/app/practice/quick?status=unanswered') {
      return 'unanswered';
    }
    if (url === '/app/practice/quick?status=incorrect') {
      return 'incorrect';
    }
    return null;
  }

  function getOrCreateLocator(
    key: string,
    create: () => VisibilityLocator,
  ): VisibilityLocator {
    const existingLocator = locatorCache.get(key);
    if (existingLocator) {
      return existingLocator;
    }

    const locator = create();
    locatorCache.set(key, locator);
    return locator;
  }

  const page = {
    goto: vi.fn(async (url: string) => {
      currentRoute = url;
      const status = parseQuickPracticeStatus(url);
      if (status) {
        currentQuickStatus = status;
        currentQuickIndex = 0;
        return;
      }

      if (url === '/app/bookmarks') {
        bookmarkVisitCount += 1;
      }
    }),
    getByRole: vi.fn((role: string, options?: { name?: string | RegExp }) => {
      const name = options?.name;
      if (role === 'heading' && name === 'Quick Practice') {
        return getOrCreateLocator('heading:Quick Practice', () =>
          createVisibilityLocator(() =>
            currentRoute.startsWith('/app/practice/quick'),
          ),
        );
      }

      if (role === 'heading' && name === 'Bookmarks') {
        return getOrCreateLocator('heading:Bookmarks', () =>
          createVisibilityLocator(() => currentRoute === '/app/bookmarks'),
        );
      }

      if (role === 'group' && name === 'Answer choices') {
        return getOrCreateLocator('group:Answer choices', () =>
          createVisibilityLocator(
            () =>
              currentRoute.startsWith('/app/practice/quick') &&
              getCurrentQuickState() !== 'exhausted',
          ),
        );
      }

      if (role !== 'button') {
        throw new Error(`Unexpected role locator: ${role}`);
      }

      if (name === 'Next') {
        return getOrCreateLocator('button:Next', () =>
          createVisibilityLocator(
            () =>
              currentRoute.startsWith('/app/practice/quick') &&
              getCurrentQuickState() !== 'exhausted',
            () => {
              currentQuickIndex += 1;
            },
          ),
        );
      }

      if (name instanceof RegExp) {
        return getOrCreateLocator(`button:${String(name)}`, () =>
          createVisibilityLocator(
            () =>
              currentRoute.startsWith('/app/practice/quick') &&
              getCurrentQuickState() === 'bookmark',
            () => {
              bookmarkCreated = true;
              if (currentQuickStatus) {
                quickStates[currentQuickStatus][currentQuickIndex] = 'remove';
              }
            },
          ),
        );
      }

      if (name === 'Remove bookmark') {
        return getOrCreateLocator('button:Remove bookmark', () =>
          createVisibilityLocator(
            () =>
              currentRoute.startsWith('/app/practice/quick') &&
              getCurrentQuickState() === 'remove',
          ),
        );
      }

      if (name === 'Remove') {
        return getOrCreateLocator('button:Remove', () =>
          createVisibilityLocator(
            () =>
              currentRoute === '/app/bookmarks' &&
              getCurrentBookmarksPageState() === 'populated',
          ),
        );
      }

      throw new Error(`Unexpected button name: ${String(name)}`);
    }),
    getByText: vi.fn((text: string) => {
      if (text === 'No more questions found.') {
        return getOrCreateLocator('text:No more questions found.', () =>
          createVisibilityLocator(
            () =>
              currentRoute.startsWith('/app/practice/quick') &&
              getCurrentQuickState() === 'exhausted',
          ),
        );
      }

      if (text === 'No bookmarks yet.') {
        return getOrCreateLocator('text:No bookmarks yet.', () =>
          createVisibilityLocator(
            () =>
              currentRoute === '/app/bookmarks' &&
              getCurrentBookmarksPageState() === 'empty',
          ),
        );
      }

      if (text === 'Unable to load bookmarks.') {
        return getOrCreateLocator('text:Unable to load bookmarks.', () =>
          createVisibilityLocator(
            () =>
              currentRoute === '/app/bookmarks' &&
              getCurrentBookmarksPageState() === 'error',
          ),
        );
      }

      throw new Error(`Unexpected text locator: ${text}`);
    }),
    waitForTimeout: vi.fn(async () => {}),
  };

  return {
    page,
    state: {
      get bookmarkCreated() {
        return bookmarkCreated;
      },
      get bookmarkVisitCount() {
        return bookmarkVisitCount;
      },
      get currentQuickIndex() {
        return currentQuickIndex;
      },
    },
  };
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
  it('returns bookmark when the Bookmark button becomes visible', async () => {
    const bookmarkButton = createWaitable(async () => {});
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const exhaustedState = createWaitable(async () => {
      throw new Error('No exhausted state');
    });
    const page = createBookmarkableQuestionPage(
      bookmarkButton,
      removeButton,
      exhaustedState,
    );

    await expect(
      waitForBookmarkableQuestionState(page, /^Bookmark$/, 1_200),
    ).resolves.toBe('bookmark');
  });

  it('returns remove when the Remove bookmark button becomes visible', async () => {
    const bookmarkButton = createWaitable(async () => {
      throw new Error('No bookmark button');
    });
    const removeButton = createWaitable(async () => {});
    const exhaustedState = createWaitable(async () => {
      throw new Error('No exhausted state');
    });
    const page = createBookmarkableQuestionPage(
      bookmarkButton,
      removeButton,
      exhaustedState,
    );

    await expect(
      waitForBookmarkableQuestionState(page, /^Bookmark$/, 1_200),
    ).resolves.toBe('remove');
  });

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

  it('returns null when no question state becomes visible within the timeout', async () => {
    const bookmarkButton = createWaitable(async () => {
      throw new Error('No bookmark button');
    });
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const exhaustedState = createWaitable(async () => {
      throw new Error('No exhausted state');
    });
    const page = createBookmarkableQuestionPage(
      bookmarkButton,
      removeButton,
      exhaustedState,
    );

    await expect(
      waitForBookmarkableQuestionState(page, /^Bookmark$/, 1_200),
    ).resolves.toBeNull();
  });
});

describe('bookmark helper flow control', () => {
  it('opens the incorrect queue when unanswered has no remaining questions', async () => {
    const { page } = createFakeInteractivePage({
      incorrectStates: ['bookmark'],
      unansweredStates: ['exhausted'],
    });

    await openQuickPracticeQuestion(page as never);

    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto).toHaveBeenNthCalledWith(
      1,
      '/app/practice/quick?status=unanswered',
      {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      },
    );
    expect(page.goto).toHaveBeenNthCalledWith(
      2,
      '/app/practice/quick?status=incorrect',
      {
        timeout: 60_000,
        waitUntil: 'domcontentloaded',
      },
    );
  });

  it('bookmarks the current question when the Bookmark button is visible', async () => {
    const { page, state } = createFakeInteractivePage({
      unansweredStates: ['bookmark'],
    });

    await ensureBookmarkedQuestion(page as never);

    expect(state.bookmarkCreated).toBe(true);
    expect(state.currentQuickIndex).toBe(0);
  });

  it('returns immediately when the current question is already bookmarked', async () => {
    const { page, state } = createFakeInteractivePage({
      unansweredStates: ['remove'],
    });
    const nextButton = page.getByRole('button', { name: 'Next' }).first();

    await ensureBookmarkedQuestion(page as never);

    expect(state.bookmarkCreated).toBe(false);
    expect(state.currentQuickIndex).toBe(0);
    expect(nextButton.click).not.toHaveBeenCalled();
  });

  it('throws without advancing when the question never reaches a stable state', async () => {
    const { page } = createFakeInteractivePage({
      unansweredStates: ['loading'],
    });

    await expect(ensureBookmarkedQuestion(page as never)).rejects.toThrow(
      'Quick Practice question did not reach a bookmarkable, already-bookmarked, or exhausted state within 2000ms.',
    );

    const nextLocator = page.getByRole('button', { name: 'Next' }).first();
    expect(nextLocator.click).not.toHaveBeenCalled();
  });

  it('creates a bookmark when the bookmarks page is empty', async () => {
    const { page, state } = createFakeInteractivePage({
      unansweredStates: ['bookmark'],
      bookmarksPageStates: ['empty'],
    });

    await ensureBookmarkExistsOnBookmarksPage(page as never);

    expect(state.bookmarkCreated).toBe(true);
    expect(state.bookmarkVisitCount).toBe(2);
  });

  it('retries the bookmarks page after an error before succeeding', async () => {
    const { page, state } = createFakeInteractivePage({
      bookmarksPageStates: ['error', 'populated'],
    });

    await ensureBookmarkExistsOnBookmarksPage(page as never);

    expect(state.bookmarkVisitCount).toBe(2);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
    expect(page.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it('throws after the bookmarks page renders only error states', async () => {
    const { page } = createFakeInteractivePage({
      bookmarksPageStates: ['error', 'error', 'error'],
    });

    await expect(
      ensureBookmarkExistsOnBookmarksPage(page as never),
    ).rejects.toThrow(
      'Bookmarks page rendered its error state 3 times in a row.',
    );
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
    expect(page.waitForTimeout).toHaveBeenNthCalledWith(1, 500);
    expect(page.waitForTimeout).toHaveBeenNthCalledWith(2, 500);
  });
});
