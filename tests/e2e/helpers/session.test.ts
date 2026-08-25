import { beforeAll, describe, expect, it, vi } from 'vitest';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';

type ExpectOptions = {
  timeout?: number;
};

type LocatorLike = import('./session').StartSessionLocator;
type PracticePageLike = import('./session').StartSessionPage;
type WaitForOptions = Parameters<LocatorLike['waitFor']>[0];

vi.mock('@playwright/test', () => ({
  expect: {
    poll(read: () => Promise<unknown> | unknown, _options?: ExpectOptions) {
      return {
        async toBe(expected: unknown) {
          let actual: unknown;
          for (let attempt = 0; attempt < 5; attempt++) {
            actual = await read();
            if (actual === expected) return;
          }

          throw new Error(
            `Expected ${String(expected)}, received ${String(actual)}.`,
          );
        },
      };
    },
  },
}));

let startSession: typeof import('./session').startSession;
let startSessionNavigationTimeoutMs: number;

beforeAll(async () => {
  const sessionModule = await import('./session');
  ({ startSession } = sessionModule);
  startSessionNavigationTimeoutMs =
    sessionModule.START_SESSION_NAVIGATION_TIMEOUT_MS;
});

function createLocator(input: {
  allTextContents?: () => string[];
  inputValue?: () => string;
  getAttribute?: (name: string) => string | null;
  isEnabled?: () => boolean;
  isVisible: () => boolean;
  onBlur?: () => void;
  onClick?: () => void;
  onFill?: (value: string) => void;
  textContent?: () => string | null;
}): LocatorLike {
  const locator: LocatorLike = {
    allTextContents: vi.fn(async () => input.allTextContents?.() ?? []),
    blur: vi.fn(async () => {
      input.onBlur?.();
    }),
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
    inputValue: vi.fn(async () => input.inputValue?.() ?? ''),
    isEnabled: vi.fn(async () => input.isEnabled?.() ?? input.isVisible()),
    isVisible: vi.fn(async () => input.isVisible()),
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
  countBlurKeepsStartHandlerStale?: boolean;
  countChangeStalesStartHandler?: boolean;
  preexistingAlerts?: string[];
  sessionStartAlert?: string;
  sessionStartAlertPollDelay?: number;
  selectedModeReselectionStalesStartHandler?: boolean;
  selectedStatusReselectionStalesStartHandler?: boolean;
}): PracticePageLike {
  const state = {
    abandonDialogOpen: false,
    currentUrl: '',
    hasIncompleteSession: input.incompleteSession ?? false,
    requestedQuestionCount: input.defaultQuestionCount ?? 1,
    selectedMode: 'tutor' as 'tutor' | 'exam',
    selectedStatus: 'Unanswered' as 'Unanswered' | 'Incorrect' | 'Bookmarked',
    startClickObserved: false,
    startHandlerIsStale: false,
    startAlertPollCount: 0,
    startedQuestionCount: null as number | null,
    sessionStarted: false,
  };
  const availableStatus = input.availableStatus ?? 'Unanswered';
  const preexistingAlerts = input.preexistingAlerts ?? [];

  const startSessionButton = createLocator({
    isEnabled: () =>
      state.currentUrl === '/app/practice' &&
      !state.hasIncompleteSession &&
      state.selectedStatus === availableStatus,
    isVisible: () =>
      state.currentUrl === '/app/practice' && !state.hasIncompleteSession,
    onClick: () => {
      if (state.startHandlerIsStale) {
        return;
      }

      if (state.selectedStatus !== availableStatus) {
        throw new Error('Fake page only supports one enabled status.');
      }

      state.startClickObserved = true;
      state.startAlertPollCount = 0;
      if (input.sessionStartAlert) {
        return;
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
        inputValue: () => String(state.requestedQuestionCount),
        onBlur: () => {
          if (!input.countBlurKeepsStartHandlerStale) {
            state.startHandlerIsStale = false;
          }
        },
        onFill: (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            state.requestedQuestionCount = Math.trunc(parsed);
            if (input.countChangeStalesStartHandler) {
              state.startHandlerIsStale = true;
            }
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
              if (
                input.selectedModeReselectionStalesStartHandler &&
                state.selectedMode === name.toLowerCase()
              ) {
                state.startHandlerIsStale = true;
              }
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
              if (
                input.selectedStatusReselectionStalesStartHandler &&
                state.selectedStatus === name
              ) {
                state.startHandlerIsStale = true;
              }
              state.selectedStatus = name;
            },
          });
        }

        if (role === 'group' && name === 'Answer choices') {
          return answerChoices;
        }

        if (role === 'alert') {
          return createLocator({
            allTextContents: () => {
              const alerts = [...preexistingAlerts];
              if (state.startClickObserved && input.sessionStartAlert) {
                state.startAlertPollCount += 1;
                if (
                  state.startAlertPollCount >
                  (input.sessionStartAlertPollDelay ?? 0)
                ) {
                  alerts.push(input.sessionStartAlert);
                }
              }
              return alerts;
            },
            isVisible: () => preexistingAlerts.length > 0,
          });
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
  it('keeps the navigation bound above the client mutation timeout', () => {
    expect(startSessionNavigationTimeoutMs).toBe(
      STANDARD_MUTATION_TIMEOUT_MS + 5_000,
    );
  });

  it('returns only after the requested session progress indicator is visible', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
    await expect(page.getByText('Question 1 of 2').isVisible()).resolves.toBe(
      true,
    );
  });

  it('starts through the current handler when the first supported status is already selected', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      selectedStatusReselectionStalesStartHandler: true,
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
  });

  it('starts through the current handler when the requested mode is already selected', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      selectedModeReselectionStalesStartHandler: true,
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
  });

  it('publishes the count-change render before clicking Start session', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      countChangeStalesStartHandler: true,
      defaultQuestionCount: 1,
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
  });

  it('fails with a rendered session-start alert instead of a URL timeout', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      sessionStartAlert: 'Request timed out. Please try again.',
      sessionStartAlertPollDelay: 2,
    });

    await expect(startSession(page, 'tutor', 2)).rejects.toThrow(
      'startSession failed before navigation: Request timed out. Please try again.',
    );
  });

  it('reports a silent start outcome with page and control diagnostics', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      countBlurKeepsStartHandlerStale: true,
      countChangeStalesStartHandler: true,
      defaultQuestionCount: 1,
    });

    await expect(startSession(page, 'tutor', 2)).rejects.toThrow(
      'startSession produced neither navigation nor a new rendered alert; current URL=/app/practice; Start session enabled=true',
    );
  });

  it('does not mistake an unchanged pre-existing alert for a start failure', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      preexistingAlerts: ['Tags unavailable.'],
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
  });

  it('redacts provider identifiers from rendered alert diagnostics', async () => {
    const providerIdentifier = ['cus', 'sensitive123'].join('_');
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      sessionStartAlert: `Could not load customer ${providerIdentifier}.`,
    });

    const result = startSession(page, 'tutor', 2);

    await expect(result).rejects.toThrow('cus_[REDACTED]');
    await expect(result).rejects.not.toThrow(providerIdentifier);
  });

  it('fails explicitly when the created session is smaller than requested', async () => {
    const page = createPracticePage({
      availableQuestionCount: 1,
      defaultQuestionCount: 1,
    });

    await expect(startSession(page, 'tutor', 2)).rejects.toThrow(
      'startSession created 1-question session but 2 were requested',
    );
  });

  it('fails explicitly when the created session is larger than requested', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      forcedActualCount: 3,
    });

    await expect(startSession(page, 'tutor', 2)).rejects.toThrow(
      'startSession created 3-question session but 2 were requested',
    );
  });
});
