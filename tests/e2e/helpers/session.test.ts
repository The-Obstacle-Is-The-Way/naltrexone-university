import { describe, expect, it, vi } from 'vitest';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import {
  START_SESSION_NAVIGATION_TIMEOUT_MS,
  type StartSessionLocator,
  type StartSessionPage,
  startSession,
} from './session';

type ExpectOptions = {
  timeout?: number;
};

type LocatorLike = StartSessionLocator;
type PracticePageLike = StartSessionPage;
type PracticePageHarness = PracticePageLike & {
  getSessionStartAlertReadCount(): number;
};
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

function createLocator(input: {
  allTextContents?: () => string[];
  inputValue?: () => string;
  getAttribute?: (name: string) => string | null;
  isEnabled?: (options?: { timeout?: number }) => boolean;
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
    isEnabled: vi.fn(
      async (options?: { timeout?: number }) =>
        input.isEnabled?.(options) ?? input.isVisible(),
    ),
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
  navigationCompletesAfterBaselineAlertRead?: boolean;
  navigationCompletesAfterCatchUrlCheck?: boolean;
  navigationCompletesDuringAlertRead?: boolean;
  preexistingAlerts?: string[];
  redirectsToSignInAfterStart?: boolean;
  sessionStartAlert?: string;
  sessionStartAlertPollDelay?: number;
  silentStartUrl?: string;
  selectedModeReselectionStalesStartHandler?: boolean;
  selectedStatusReselectionStalesStartHandler?: boolean;
}): PracticePageHarness {
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
    sessionStartAlertReadCount: 0,
    startedQuestionCount: null as number | null,
    sessionStarted: false,
    sessionStartNavigationCompletesOnNextUrlRead: false,
    sessionStartNavigationPending: false,
  };
  const availableStatus = input.availableStatus ?? 'Unanswered';
  const preexistingAlerts = input.preexistingAlerts ?? [];

  const completeSessionStart = () => {
    state.startedQuestionCount =
      input.forcedActualCount ??
      Math.min(state.requestedQuestionCount, input.availableQuestionCount);
    state.currentUrl = '/app/practice/session-1';
    state.sessionStarted = true;
  };

  const startSessionButton = createLocator({
    isEnabled: () =>
      state.currentUrl === '/app/practice' &&
      !state.hasIncompleteSession &&
      state.selectedStatus === availableStatus,
    isVisible: () =>
      state.currentUrl === '/app/practice' && !state.hasIncompleteSession,
    onClick: () => {
      if (state.startHandlerIsStale) {
        state.currentUrl = input.silentStartUrl ?? state.currentUrl;
        return;
      }

      if (state.selectedStatus !== availableStatus) {
        throw new Error('Fake page only supports one enabled status.');
      }

      state.startClickObserved = true;
      state.startAlertPollCount = 0;
      if (input.redirectsToSignInAfterStart) {
        state.currentUrl = '/sign-in?redirect_url=%2Fapp%2Fpractice';
        return;
      }
      if (input.sessionStartAlert) {
        return;
      }

      if (
        input.navigationCompletesAfterBaselineAlertRead ||
        input.navigationCompletesDuringAlertRead ||
        input.navigationCompletesAfterCatchUrlCheck
      ) {
        state.sessionStartNavigationPending = true;
        return;
      }

      completeSessionStart();
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
              state.sessionStartAlertReadCount += 1;
              if (
                state.sessionStartNavigationPending &&
                input.navigationCompletesAfterBaselineAlertRead
              ) {
                state.sessionStartNavigationPending = false;
                state.sessionStartNavigationCompletesOnNextUrlRead = true;
                return [...preexistingAlerts];
              }
              if (state.sessionStartNavigationPending) {
                state.sessionStartNavigationPending = false;
                if (input.navigationCompletesAfterCatchUrlCheck) {
                  state.sessionStartNavigationCompletesOnNextUrlRead = true;
                  throw new Error(
                    'Execution context was destroyed, most likely because of a navigation',
                  );
                }
                completeSessionStart();
                throw new Error(
                  'Execution context was destroyed, most likely because of a navigation',
                );
              }

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
    getSessionStartAlertReadCount: () => state.sessionStartAlertReadCount,
    url: () => {
      if (state.sessionStartNavigationCompletesOnNextUrlRead) {
        state.sessionStartNavigationCompletesOnNextUrlRead = false;
        completeSessionStart();
      }
      return state.currentUrl;
    },
  };
}

describe('startSession helper', () => {
  it('keeps the navigation bound above the client mutation timeout', () => {
    expect(START_SESSION_NAVIGATION_TIMEOUT_MS).toBe(
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

  it('accepts navigation that destroys the alert context between outcome checks', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      navigationCompletesDuringAlertRead: true,
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
  });

  it('observes navigation without waiting for an alert read to reject', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      navigationCompletesAfterCatchUrlCheck: true,
    });

    await startSession(page, 'exam', 2);

    expect(page.url()).toBe('/app/practice/session-1');
    expect(page.getSessionStartAlertReadCount()).toBe(2);
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

  it('redacts Clerk credentials from silent-start URL diagnostics', async () => {
    const clerkHandshakeValue = ['clerk', 'handshake', 'value'].join('-');
    const page = createPracticePage({
      availableQuestionCount: 5,
      countBlurKeepsStartHandlerStale: true,
      countChangeStalesStartHandler: true,
      defaultQuestionCount: 1,
      silentStartUrl: `/app/practice?__clerk_handshake=${clerkHandshakeValue}&next=1`,
    });

    const result = startSession(page, 'tutor', 2);

    await expect(result).rejects.toThrow('__clerk_handshake=[redacted]');
    await expect(result).rejects.not.toThrow(clerkHandshakeValue);
  });

  it('fails explicitly when Clerk redirects the fresh session back to sign-in', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      redirectsToSignInAfterStart: true,
    });

    await expect(startSession(page, 'tutor', 2)).rejects.toThrow(
      'startSession lost Clerk authentication and was redirected to sign-in',
    );
  });

  it('bounds the Start-button diagnostic when navigation removes the locator', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      countBlurKeepsStartHandlerStale: true,
      countChangeStalesStartHandler: true,
      defaultQuestionCount: 1,
    });
    const startButton = page.getByRole('button', { name: 'Start session' });

    await expect(startSession(page, 'tutor', 2)).rejects.toThrow(
      'startSession produced neither navigation nor a new rendered alert',
    );

    expect(startButton.isEnabled).toHaveBeenLastCalledWith({ timeout: 1_000 });
  });

  it('does not mistake an unchanged pre-existing alert for a start failure', async () => {
    const page = createPracticePage({
      availableQuestionCount: 5,
      defaultQuestionCount: 1,
      navigationCompletesAfterBaselineAlertRead: true,
      preexistingAlerts: ['Tags unavailable.'],
    });

    await startSession(page, 'tutor', 2);

    expect(page.url()).toBe('/app/practice/session-1');
    expect(page.getSessionStartAlertReadCount()).toBeGreaterThan(1);
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
