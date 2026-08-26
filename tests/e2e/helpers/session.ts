import { expect } from '@playwright/test';
import { STANDARD_MUTATION_TIMEOUT_MS } from '@/app/(app)/app/shared/timeout-tiers';
import { parseQuestionProgressCount } from './question-progress';

export type PracticeMode = 'tutor' | 'exam';

export type StartSessionLocator = {
  allTextContents(): Promise<string[]>;
  blur(): Promise<void>;
  click(): Promise<void>;
  count(): Promise<number>;
  fill(value: string): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  inputValue(): Promise<string>;
  isEnabled(options?: { timeout?: number }): Promise<boolean>;
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  waitFor(options: { state: 'visible'; timeout?: number }): Promise<void>;
};

export type StartSessionPage = {
  goto(url: string): Promise<unknown>;
  getByLabel(label: string): StartSessionLocator;
  getByRole(
    role: 'alert' | 'button' | 'group' | 'heading',
    options?: { exact?: boolean; name?: string },
  ): StartSessionLocator;
  getByText(text: RegExp | string): StartSessionLocator;
  url(): string;
};

const DEFAULT_START_SESSION_STATE_TIMEOUT_MS = 30_000;
const START_SESSION_INPUT_SYNC_TIMEOUT_MS = 10_000;
const START_SESSION_DIAGNOSTIC_TIMEOUT_MS = 1_000;

export const START_SESSION_NAVIGATION_TIMEOUT_MS =
  STANDARD_MUTATION_TIMEOUT_MS + 5_000;

const SENSITIVE_PROVIDER_IDENTIFIER_PATTERN =
  /\b(cus|sub|clock|acct|req|seti|si|pm|in|price|cs|evt|sk_test)_[A-Za-z0-9]+\b/g;

async function waitForEitherVisible(
  first: StartSessionLocator,
  second: StartSessionLocator,
  timeout = DEFAULT_START_SESSION_STATE_TIMEOUT_MS,
): Promise<void> {
  await expect
    .poll(
      async () =>
        (await first.isVisible().catch(() => false)) ||
        (await second.isVisible().catch(() => false)),
      { timeout },
    )
    .toBe(true);
}

async function waitForAttribute(
  locator: StartSessionLocator,
  name: string,
  value: string,
  timeout: number,
): Promise<void> {
  await expect
    .poll(async () => (await locator.getAttribute(name)) === value, { timeout })
    .toBe(true);
}

async function waitForEnabled(
  locator: StartSessionLocator,
  timeout: number,
): Promise<void> {
  await expect.poll(() => locator.isEnabled(), { timeout }).toBe(true);
}

function redactDiagnosticText(value: string): string {
  return value.replace(SENSITIVE_PROVIDER_IDENTIFIER_PATTERN, '$1_[REDACTED]');
}

async function readNonemptyAlertTexts(
  alertLocator: StartSessionLocator,
): Promise<string[]> {
  return (await alertLocator.allTextContents())
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
}

function isNavigationContextDestroyed(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Execution context was destroyed') &&
    error.message.includes('navigation')
  );
}

function isClerkSignInRedirect(url: string): boolean {
  try {
    return new URL(url, 'http://e2e.invalid').pathname.startsWith('/sign-in');
  } catch {
    return false;
  }
}

function createClerkAuthLossError(): Error {
  return new Error(
    'startSession lost Clerk authentication and was redirected to sign-in',
  );
}

function countTexts(texts: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return counts;
}

function findAdditionalAlert(
  texts: readonly string[],
  baselineCounts: ReadonlyMap<string, number>,
): string | null {
  const observedCounts = new Map<string, number>();
  for (const text of texts) {
    const observed = (observedCounts.get(text) ?? 0) + 1;
    observedCounts.set(text, observed);
    if (observed > (baselineCounts.get(text) ?? 0)) return text;
  }
  return null;
}

async function waitForSessionStartOutcome(input: {
  page: StartSessionPage;
  startSessionButton: StartSessionLocator;
  initialAlertCounts: ReadonlyMap<string, number>;
}): Promise<void> {
  const expectedUrl = /\/app\/practice\/[^/]+$/;
  const alerts = input.page.getByRole('alert');
  let clerkAuthLost = false;
  let renderedStartAlert: string | null = null;

  try {
    await expect
      .poll(
        async () => {
          if (expectedUrl.test(input.page.url())) return true;
          if (isClerkSignInRedirect(input.page.url())) {
            clerkAuthLost = true;
            return true;
          }
          try {
            renderedStartAlert = findAdditionalAlert(
              await readNonemptyAlertTexts(alerts),
              input.initialAlertCounts,
            );
          } catch (error) {
            // Navigation can invalidate the alert locator between the URL read
            // and DOM evaluation. Keep polling so the committed URL remains
            // authoritative instead of entering diagnostics mid-navigation.
            if (isNavigationContextDestroyed(error)) return false;
            throw error;
          }
          return renderedStartAlert !== null;
        },
        { timeout: START_SESSION_NAVIGATION_TIMEOUT_MS },
      )
      .toBe(true);
  } catch (error) {
    if (expectedUrl.test(input.page.url())) return;
    if (isClerkSignInRedirect(input.page.url())) {
      throw createClerkAuthLossError();
    }

    const currentAlerts = await readNonemptyAlertTexts(alerts).catch(() => []);
    const renderedAlerts =
      currentAlerts.length === 0
        ? '[none]'
        : currentAlerts
            .map((text) => redactDiagnosticText(text))
            .join(' | ')
            .slice(0, 500);
    const startEnabled = await input.startSessionButton
      .isEnabled({ timeout: START_SESSION_DIAGNOSTIC_TIMEOUT_MS })
      .catch(() => false);
    throw new Error(
      `startSession produced neither navigation nor a new rendered alert; current URL=${redactDiagnosticText(input.page.url())}; Start session enabled=${String(startEnabled)}; rendered alerts=${renderedAlerts}`,
      { cause: error },
    );
  }

  if (expectedUrl.test(input.page.url())) return;
  if (clerkAuthLost || isClerkSignInRedirect(input.page.url())) {
    throw createClerkAuthLossError();
  }
  if (renderedStartAlert) {
    throw new Error(
      `startSession failed before navigation: ${redactDiagnosticText(renderedStartAlert)}`,
    );
  }

  throw new Error('startSession outcome polling ended without an outcome');
}

async function verifyRequestedSessionCount(
  page: StartSessionPage,
  requestedCount: number,
): Promise<void> {
  const progressIndicator = page.getByText(/^Question 1 of \d+\b/);
  await progressIndicator.waitFor({ state: 'visible', timeout: 15_000 });

  const progressText = (await progressIndicator.textContent())?.trim() ?? '';
  const actualCount = parseQuestionProgressCount(progressText);
  if (actualCount !== requestedCount) {
    throw new Error(
      `startSession created ${actualCount}-question session but ${requestedCount} were requested`,
    );
  }
}

export async function startSession(
  page: StartSessionPage,
  mode: PracticeMode = 'tutor',
  count = 1,
): Promise<void> {
  await page.goto('/app/practice');
  await page
    .getByRole('heading', { name: 'Practice' })
    .waitFor({ state: 'visible' });

  const startSessionButton = page.getByRole('button', {
    name: 'Start session',
  });
  const abandonButton = page.getByRole('button', { name: 'Abandon session' });

  // Practice page async-loads incomplete session state. Wait until either:
  // - the session starter is available ("Start session" button), or
  // - the continue-session card is available ("Abandon session" button).
  await waitForEitherVisible(startSessionButton, abandonButton);

  // If an incomplete session exists, abandon it first
  const abandonCount = await abandonButton.count();
  if (abandonCount > 0) {
    await abandonButton.click();
    // Confirm the abandon dialog
    await page.getByRole('button', { name: 'Abandon anyway' }).click();
    // Wait for the page to reload after abandoning
    await startSessionButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  // Mode: SegmentedControl with buttons (not a <select>).
  // Use { exact: true } to avoid matching "View breakdown for Tutor session..." buttons.
  await page
    .getByRole('button', { name: 'Tutor', exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 });
  const selectedModeButton = page.getByRole('button', {
    name: mode === 'tutor' ? 'Tutor' : 'Exam',
    exact: true,
  });
  const modeIsAlreadySelected =
    (await selectedModeButton.getAttribute('aria-pressed')) === 'true';
  if (!modeIsAlreadySelected) {
    await selectedModeButton.click();
    await waitForAttribute(selectedModeButton, 'aria-pressed', 'true', 10_000);
  }

  // Status options do not include "All". To avoid brittle failures when the shared
  // E2E user has exhausted "Unanswered", probe the supported statuses and pick the
  // first one that enables "Start session" for the requested count.
  const supportedStatuses = ['Unanswered', 'Incorrect', 'Bookmarked'] as const;
  let selectedStatus: (typeof supportedStatuses)[number] | null = null;
  let lastProbeError: unknown = null;

  for (const statusLabel of supportedStatuses) {
    const statusButton = page.getByRole('button', {
      name: statusLabel,
      exact: true,
    });
    const statusIsAlreadySelected =
      (await statusButton.getAttribute('aria-pressed')) === 'true';
    if (!statusIsAlreadySelected) {
      await statusButton.click();
      await waitForAttribute(statusButton, 'aria-pressed', 'true', 10_000);
    }

    // Count: label is "Questions" (not "Count"). Blurring and observing the
    // controlled value proves React published the count-change render before
    // Start can invoke a handler captured by the superseded intent.
    const questionsInput = page.getByLabel('Questions');
    await questionsInput.fill(String(count));
    await questionsInput.blur();
    await expect
      .poll(() => questionsInput.inputValue(), {
        timeout: START_SESSION_INPUT_SYNC_TIMEOUT_MS,
      })
      .toBe(String(count));

    try {
      await waitForEnabled(startSessionButton, 3_000);
      selectedStatus = statusLabel;
      break;
    } catch (error) {
      // Try the next supported status.
      lastProbeError = error;
    }
  }

  if (!selectedStatus) {
    throw new Error(
      `Could not enable Start session after trying statuses: ${supportedStatuses.join(
        ', ',
      )}`,
      { cause: lastProbeError ?? undefined },
    );
  }

  const initialAlertCounts = countTexts(
    await readNonemptyAlertTexts(page.getByRole('alert')),
  );
  await startSessionButton.click();
  await waitForSessionStartOutcome({
    page,
    startSessionButton,
    initialAlertCounts,
  });
  const expectedHeadingName =
    mode === 'tutor' ? 'Tutor Session' : 'Exam Session';
  await page
    .getByRole('heading', { name: expectedHeadingName })
    .waitFor({ state: 'visible', timeout: 15_000 });

  // Wait for the first question to load. In dev mode, the getNextQuestion
  // server action may hit its 15s withTimeout on the first call due to
  // on-demand compilation, showing "Request timed out. Please try again."
  // Most runs recover on the next call after compilation is cached, but we
  // keep one extra retry to absorb occasional cold-start variance in CI/local.
  const answerChoices = page.getByRole('group', { name: 'Answer choices' });
  const tryAgainButton = page.getByRole('button', { name: 'Try again' });
  const maxLoadAttempts = 3;

  for (let attempt = 1; attempt <= maxLoadAttempts; attempt++) {
    await waitForEitherVisible(answerChoices, tryAgainButton, 60_000);

    if (await answerChoices.isVisible().catch(() => false)) {
      await verifyRequestedSessionCount(page, count);
      return; // Question loaded successfully
    }

    // "Request timed out" — click "Try again" while attempts remain.
    if (
      attempt < maxLoadAttempts &&
      (await tryAgainButton.isVisible().catch(() => false))
    ) {
      await tryAgainButton.click();
    }
  }

  // Final check — if still no answer choices after retries, fail explicitly
  await answerChoices.waitFor({ state: 'visible', timeout: 60_000 });
}
