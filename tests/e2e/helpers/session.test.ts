import { beforeAll, describe, expect, it, vi } from 'vitest';

type WaitForOptions = {
  state: 'visible';
  timeout?: number;
};

type ExpectOptions = {
  timeout?: number;
};

type LocatorLike = {
  click: () => Promise<void>;
  count: () => Promise<number>;
  fill: (value: string) => Promise<void>;
  getAttribute: (name: string) => Promise<string | null>;
  isEnabled: () => Promise<boolean>;
  isVisible: () => Promise<boolean>;
  or: (other: LocatorLike) => LocatorLike;
  textContent: () => Promise<string | null>;
  waitFor: (options: WaitForOptions) => Promise<void>;
};

type FakeLocator = LocatorLike & {
  isVisibleNow: () => boolean;
  textNow: () => string | null;
};

type PracticePageLike = {
  goto: (url: string) => Promise<void>;
  getByLabel: (label: string) => LocatorLike;
  getByRole: (
    role: string,
    options?: { exact?: boolean; name?: string },
  ) => LocatorLike;
  getByText: (text: RegExp | string) => LocatorLike;
  url: () => string;
};

vi.mock('@playwright/test', () => ({
  expect: (target: unknown) => ({
    async toBeEnabled(_options?: ExpectOptions) {
      const locator = target as FakeLocator;
      if (!(await locator.isEnabled())) {
        throw new Error('Expected locator to be enabled.');
      }
    },
    async toBeVisible(options?: ExpectOptions) {
      const locator = target as FakeLocator;
      await locator.waitFor({
        state: 'visible',
        timeout: options?.timeout,
      });
    },
    async toHaveAttribute(
      name: string,
      expected: string,
      _options?: ExpectOptions,
    ) {
      const locator = target as FakeLocator;
      const actual = await locator.getAttribute(name);
      if (actual !== expected) {
        throw new Error(
          `Expected ${name}=${expected}, received ${String(actual)}.`,
        );
      }
    },
    async toHaveURL(expected: RegExp, _options?: ExpectOptions) {
      const page = target as PracticePageLike;
      const actual = page.url();
      if (!expected.test(actual)) {
        throw new Error(
          `Expected URL ${String(expected)}, received ${actual}.`,
        );
      }
    },
  }),
}));

let startSession: typeof import('./session').startSession;

beforeAll(async () => {
  ({ startSession } = await import('./session'));
});

function createLocator(input: {
  getAttribute?: (name: string) => string | null;
  isEnabled?: () => boolean;
  isVisible: () => boolean;
  onClick?: () => void;
  onFill?: (value: string) => void;
  textContent?: () => string | null;
}): FakeLocator {
  const locator: FakeLocator = {
    isVisibleNow: input.isVisible,
    textNow: () => input.textContent?.() ?? null,
    click: vi.fn(async () => {
      if (!input.isVisible()) {
        throw new Error('Cannot click a hidden locator.');
      }

      input.onClick?.();
    }),
    count: vi.fn(async () => (input.isVisible() ? 1 : 0)),
    fill: vi.fn(async (value: string) => {
      input.onFill?.(value);
    }),
    getAttribute: vi.fn(
      async (name: string) => input.getAttribute?.(name) ?? null,
    ),
    isEnabled: vi.fn(async () => input.isEnabled?.() ?? input.isVisible()),
    isVisible: vi.fn(async () => input.isVisible()),
    or(other: LocatorLike): LocatorLike {
      const otherLocator = other as FakeLocator;
      return createLocator({
        isVisible: () => locator.isVisibleNow() || otherLocator.isVisibleNow(),
        textContent: () => locator.textNow() ?? otherLocator.textNow(),
      });
    },
    textContent: vi.fn(async () => input.textContent?.() ?? null),
    waitFor: vi.fn(async ({ state }: WaitForOptions) => {
      if (state !== 'visible') {
        throw new Error(`Unsupported waitFor state: ${state}`);
      }

      if (!input.isVisible()) {
        throw new Error('Locator did not become visible.');
      }
    }),
  };

  return locator;
}

function createPracticePage(input: {
  availableQuestionCount: number;
  availableStatus?: 'Unanswered' | 'Incorrect' | 'Bookmarked';
  defaultQuestionCount?: number;
  forcedActualCount?: number;
  incompleteSession?: boolean;
}): PracticePageLike {
  const state = {
    abandonDialogOpen: false,
    currentUrl: '',
    hasIncompleteSession: input.incompleteSession ?? false,
    requestedQuestionCount: input.defaultQuestionCount ?? 1,
    selectedMode: 'tutor' as 'tutor' | 'exam',
    selectedStatus: 'Unanswered' as 'Unanswered' | 'Incorrect' | 'Bookmarked',
    startedQuestionCount: null as number | null,
    sessionStarted: false,
  };
  const availableStatus = input.availableStatus ?? 'Unanswered';

  const startSessionButton = createLocator({
    isEnabled: () =>
      state.currentUrl === '/app/practice' &&
      !state.hasIncompleteSession &&
      state.selectedStatus === availableStatus,
    isVisible: () =>
      state.currentUrl === '/app/practice' && !state.hasIncompleteSession,
    onClick: () => {
      if (state.selectedStatus !== availableStatus) {
        throw new Error('Fake page only supports one enabled status.');
      }

      state.startedQuestionCount =
        input.forcedActualCount ??
        Math.min(state.requestedQuestionCount, input.availableQuestionCount);
      state.currentUrl = '/app/practice/session-1';
      state.sessionStarted = true;
    },
  });

  const abandonButton = createLocator({
    isVisible: () =>
      state.currentUrl === '/app/practice' && state.hasIncompleteSession,
    onClick: () => {
      state.abandonDialogOpen = true;
    },
  });

  const abandonAnywayButton = createLocator({
    isVisible: () => state.abandonDialogOpen,
    onClick: () => {
      state.abandonDialogOpen = false;
      state.hasIncompleteSession = false;
    },
  });

  const answerChoices = createLocator({
    isVisible: () => state.sessionStarted,
  });

  const tryAgainButton = createLocator({
    isVisible: () => false,
  });

  return {
    goto: vi.fn(async (url: string) => {
      state.currentUrl = url;
      state.sessionStarted = false;
      state.abandonDialogOpen = false;
    }),
    getByLabel: vi.fn((label: string) => {
      if (label !== 'Questions') {
        throw new Error(`Unexpected label locator: ${label}`);
      }

      return createLocator({
        isVisible: () =>
          state.currentUrl === '/app/practice' && !state.hasIncompleteSession,
        onFill: (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            state.requestedQuestionCount = Math.trunc(parsed);
          }
        },
      });
    }),
    getByRole: vi.fn(
      (role: string, options?: { exact?: boolean; name?: string }) => {
        const name = options?.name;

        if (role === 'heading' && name === 'Practice') {
          return createLocator({
            isVisible: () => state.currentUrl === '/app/practice',
          });
        }

        if (
          role === 'heading' &&
          name ===
            (state.selectedMode === 'tutor' ? 'Tutor Session' : 'Exam Session')
        ) {
          return createLocator({
            isVisible: () => state.sessionStarted,
          });
        }

        if (role === 'button' && name === 'Start session') {
          return startSessionButton;
        }

        if (role === 'button' && name === 'Abandon session') {
          return abandonButton;
        }

        if (role === 'button' && name === 'Abandon anyway') {
          return abandonAnywayButton;
        }

        if (role === 'button' && (name === 'Tutor' || name === 'Exam')) {
          return createLocator({
            getAttribute: (attribute) =>
              attribute === 'aria-pressed'
                ? String(state.selectedMode === name.toLowerCase())
                : null,
            isVisible: () =>
              state.currentUrl === '/app/practice' &&
              !state.hasIncompleteSession,
            onClick: () => {
              state.selectedMode = name.toLowerCase() as 'tutor' | 'exam';
            },
          });
        }

        if (
          role === 'button' &&
          (name === 'Unanswered' ||
            name === 'Incorrect' ||
            name === 'Bookmarked')
        ) {
          return createLocator({
            getAttribute: (attribute) =>
              attribute === 'aria-pressed'
                ? String(state.selectedStatus === name)
                : null,
            isVisible: () =>
              state.currentUrl === '/app/practice' &&
              !state.hasIncompleteSession,
            onClick: () => {
              state.selectedStatus = name;
            },
          });
        }

        if (role === 'group' && name === 'Answer choices') {
          return answerChoices;
        }

        if (role === 'button' && name === 'Try again') {
          return tryAgainButton;
        }

        throw new Error(
          `Unexpected role locator: ${role} (${String(name)}, exact=${String(options?.exact)})`,
        );
      },
    ),
    getByText: vi.fn((text: RegExp | string) => {
      // The real UI renders "Question 1 of 2 — Explanations shown after each answer."
      // for tutor mode and similar suffixes for exam mode. Replicate the full text
      // so that regex-based locators are tested against the real format.
      const modeHint =
        state.selectedMode === 'tutor'
          ? 'Explanations shown after each answer.'
          : 'Explanations shown after you submit the exam.';
      const sessionProgress = `Question 1 of ${state.startedQuestionCount ?? 0} — ${modeHint}`;
      const matches =
        typeof text === 'string'
          ? sessionProgress.includes(text)
          : text.test(sessionProgress);

      return createLocator({
        isVisible: () => state.sessionStarted && matches,
        textContent: () =>
          state.sessionStarted && matches ? sessionProgress : null,
      });
    }),
    url: () => state.currentUrl,
  };
}

describe('startSession helper', () => {
  it('returns only after the requested session progress indicator is visible', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
    });

    await startSession(page as never, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
    await expect(page.getByText('Question 1 of 2').isVisible()).resolves.toBe(
      true,
    );
  });

  it('fails explicitly when the created session is smaller than requested', async () => {
    const page = createPracticePage({
      availableQuestionCount: 1,
      defaultQuestionCount: 1,
    });

    await expect(startSession(page as never, 'tutor', 2)).rejects.toThrow(
      'startSession created 1-question session but 2 were requested',
    );
  });

  it('fails explicitly when the created session is larger than requested', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      forcedActualCount: 3,
    });

    await expect(startSession(page as never, 'tutor', 2)).rejects.toThrow(
      'startSession created 3-question session but 2 were requested',
    );
  });
});
