import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { clerk } from '@clerk/testing/playwright';
import type { Page, Response } from '@playwright/test';
import { TimeoutError, withTimeout } from '@/lib/with-timeout';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  E2E_CLERK_RESTORE_FAILURE_PATH,
  E2E_CLERK_SESSION_ID_PATH,
  readIfPresent,
  saveClerkE2EAuthState,
} from './clerk-auth-state';
import {
  clerkFrontendApiHost,
  describeFrontendApiAnswer,
  startClerkAuthTrace,
} from './clerk-auth-trace';
import { CLERK_SESSION_DEADLINES } from './clerk-session-deadlines';
import {
  installE2ELogRedaction,
  redactSensitiveE2EText,
} from './e2e-log-redaction';

export { E2E_CLERK_AUTH_STATE_PATH } from './clerk-auth-state';
export { describeFrontendApiAnswer } from './clerk-auth-trace';

export const clerkUsername = process.env.E2E_CLERK_USER_USERNAME;
export const clerkPassword = process.env.E2E_CLERK_USER_PASSWORD;

type ClerkSessionWaitPage = {
  waitForFunction(predicate: () => boolean): Promise<unknown>;
};

type ClerkE2EPage = {
  goto(url: string): Promise<unknown>;
};

type ClerkE2EDriver<TPage extends ClerkE2EPage> = {
  hasActiveSession(page: TPage): Promise<boolean>;
  load(page: TPage): Promise<void>;
  signIn(input: {
    page: TPage;
    password: string;
    username: string;
  }): Promise<void>;
  signOut(page: TPage): Promise<void>;
  waitForActiveSession(page: TPage): Promise<void>;
  waitForSignedOut(page: TPage): Promise<void>;
};

export async function ensureClerkE2ESession<TPage extends ClerkE2EPage>(input: {
  clerkDriver: ClerkE2EDriver<TPage>;
  page: TPage;
  password: string;
  username: string;
}): Promise<void> {
  await input.page.goto('/');
  await input.clerkDriver.load(input.page);
  if (await input.clerkDriver.hasActiveSession(input.page)) return;

  await input.page.goto('/sign-in');
  await input.clerkDriver.signIn({
    page: input.page,
    password: input.password,
    username: input.username,
  });
  await input.clerkDriver.waitForActiveSession(input.page);
}

// BUG-328: each setup attempt runs in a new browser, and teardown signs out
// only the stored session. A failed attempt signs out its own session, or it
// stays live until Clerk expires it. Both phases have deadlines, because
// Clerk's sign-in and sign-out can run longer than any Playwright bound.
export async function createClerkE2ESession<TPage extends ClerkE2EPage>(input: {
  clerkDriver: ClerkE2EDriver<TPage>;
  deadlines?: { signInMs: number; signOutMs: number };
  page: TPage;
  password: string;
  saveState(): Promise<void>;
  username: string;
}): Promise<void> {
  const deadlines = input.deadlines ?? CLERK_SESSION_DEADLINES;
  let abandoned = false;
  const signIn = async () => {
    await ensureClerkE2ESession(input);
    // A sign-in that finishes after its deadline never saves its state. If it
    // finishes after the sign-out has checked for a session, that session is
    // not signed out, and stays live until Clerk expires it.
    if (!abandoned) await input.saveState();
  };
  try {
    await withTimeout(signIn(), deadlines.signInMs);
  } catch (error) {
    abandoned = true;
    await withTimeout(releaseClerkE2ESession(input), deadlines.signOutMs).catch(
      () => {
        console.warn(
          'Could not confirm the sign-out after a failed setup attempt; a Clerk E2E session it created stays live until Clerk expires it',
        );
      },
    );
    throw error;
  }
}

export async function releaseClerkE2ESession<
  TPage extends ClerkE2EPage,
>(input: { clerkDriver: ClerkE2EDriver<TPage>; page: TPage }): Promise<void> {
  await input.page.goto('/');
  await input.clerkDriver.load(input.page);
  if (!(await input.clerkDriver.hasActiveSession(input.page))) return;

  await input.clerkDriver.signOut(input.page);
  await input.clerkDriver.waitForSignedOut(input.page);
}

export type RestoreFailures = {
  read(): Promise<string | null>;
  write(message: string): Promise<void>;
};

const RESTORE_FAILED =
  'The stored Clerk E2E session could not be restored; every later signed-in test fails with this error';

/**
 * Restores the session global setup stored, and never creates one. BUG-330:
 * the first failed restore records one error naming what Clerk's Frontend API
 * answered, and every later signed-in test fails with it at once, without
 * loading a page.
 */
export async function requireStoredClerkE2ESession<
  TPage extends ClerkE2EPage,
>(input: {
  clerkDriver: ClerkE2EDriver<TPage>;
  page: TPage;
  failures: RestoreFailures;
  describeFailure(): Promise<string>;
  deadlineMs?: number;
}): Promise<void> {
  const recorded = await input.failures.read();
  if (recorded) throw new Error(recorded);

  const deadlineMs = input.deadlineMs ?? CLERK_SESSION_DEADLINES.restoreMs;
  const restore = async () => {
    await input.page.goto('/');
    await input.clerkDriver.load(input.page);
    return input.clerkDriver.hasActiveSession(input.page);
  };
  let cause = '';
  try {
    if (await withTimeout(restore(), deadlineMs)) return;
  } catch (error) {
    cause =
      error instanceof TimeoutError
        ? ` The restore did not finish within ${deadlineMs} ms.`
        : ` ${redactSensitiveE2EText(error instanceof Error ? error.message : String(error))}`;
  }
  const message = `${RESTORE_FAILED}.${cause} ${await input.describeFailure()}`;
  await input.failures.write(message);
  throw new Error(message);
}

export async function waitForActiveClerkSession(
  page: ClerkSessionWaitPage,
): Promise<void> {
  await page.waitForFunction(() => {
    const clerkWindow = window as typeof window & {
      Clerk?: { session?: unknown };
    };
    return Boolean(clerkWindow.Clerk?.session);
  });
}

const playwrightClerkDriver: ClerkE2EDriver<Page> = {
  hasActiveSession: (page) =>
    page.evaluate(() => Boolean(window.Clerk?.session)),
  load: (page) => clerk.loaded({ page }),
  signIn: ({ page, password, username }) =>
    clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: username,
        password,
      },
    }),
  signOut: (page) => clerk.signOut({ page }),
  waitForActiveSession: waitForActiveClerkSession,
  waitForSignedOut: (page) =>
    page.waitForFunction(() => !window.Clerk?.session).then(() => undefined),
};

export async function signInWithClerkPassword(page: Page): Promise<void> {
  if (!clerkUsername || !clerkPassword) {
    throw new Error('Missing Clerk E2E credentials');
  }

  // Clerk's route handler can warn after the page closes and includes the
  // development browser credential in its request URL. Keep the warning while
  // preventing that credential from entering local or hosted test logs.
  installE2ELogRedaction(console);
  // The historical helper name is retained for its existing callers. Global
  // setup is now the only session creator; test cases fail closed if their
  // explicitly configured storage state is missing or invalid.
  // BUG-333: kept for the whole test, so a mid-run loss names its cause.
  await startClerkAuthTrace(page);
  const frontendApi = watchFrontendApi(page);
  try {
    await requireStoredClerkE2ESession({
      clerkDriver: playwrightClerkDriver,
      page,
      failures: restoreFailures,
      describeFailure: async () =>
        withTimeout(frontendApi.describe(), DIAGNOSIS_TIMEOUT_MS).catch(
          () => 'Frontend API answers could not be read in time.',
        ),
    });
  } finally {
    // The test's own Frontend API traffic is not read.
    frontendApi.stop();
  }
}

const DIAGNOSIS_TIMEOUT_MS = 5_000;

// A file, not module state: Playwright starts a new worker after a failed
// test. Global setup clears it, and so does teardown.
const restoreFailures: RestoreFailures = {
  read: () => readIfPresent(E2E_CLERK_RESTORE_FAILURE_PATH),
  write: async (message) => {
    await mkdir(dirname(E2E_CLERK_RESTORE_FAILURE_PATH), { recursive: true });
    await writeFile(E2E_CLERK_RESTORE_FAILURE_PATH, message);
  },
};

// Records the Frontend API's answers from the page's first request on, since
// Clerk's script calls it while the page is still loading.
function watchFrontendApi(page: Page): {
  describe(): Promise<string>;
  stop(): void;
} {
  const host = clerkFrontendApiHost();
  const answers: Promise<string>[] = [];
  const onResponse = (response: Response) => {
    const url = new URL(response.url());
    if (url.host !== host || !url.pathname.startsWith('/v1/')) return;
    answers.push(
      response
        .json()
        .catch(() => undefined)
        .then((body) =>
          describeFrontendApiAnswer({
            method: response.request().method(),
            url: response.url(),
            status: response.status(),
            body,
          }),
        ),
    );
  };
  page.on('response', onResponse);
  return {
    stop: () => {
      page.off('response', onResponse);
    },
    describe: async () => {
      const seen = await Promise.all(answers);
      const status = await page
        .evaluate(
          () =>
            (window as typeof window & { Clerk?: { status?: unknown } }).Clerk
              ?.status,
        )
        .catch(() => undefined);
      return `Frontend API: ${seen.length > 0 ? seen.join('; ') : 'no answer'}; Clerk status: ${typeof status === 'string' ? status : 'unknown'}.`;
    },
  };
}

export async function createClerkE2EAuthState(page: Page): Promise<void> {
  if (!clerkUsername || !clerkPassword) {
    throw new Error('Missing Clerk E2E credentials');
  }

  installE2ELogRedaction(console);
  // BUG-330: a new session clears an earlier run's failed restore.
  await rm(E2E_CLERK_RESTORE_FAILURE_PATH, { force: true });
  await createClerkE2ESession({
    clerkDriver: playwrightClerkDriver,
    page,
    password: clerkPassword,
    saveState: async () => {
      await mkdir(dirname(E2E_CLERK_AUTH_STATE_PATH), { recursive: true });
      // BUG-330: teardown revokes this session by its ID.
      await saveClerkE2EAuthState({
        readSessionId: () =>
          page.evaluate(() => window.Clerk?.session?.id ?? null),
        writeSessionId: (sessionId) =>
          writeFile(E2E_CLERK_SESSION_ID_PATH, sessionId),
        writeState: () =>
          page
            .context()
            .storageState({ path: E2E_CLERK_AUTH_STATE_PATH })
            .then(() => undefined),
      });
    },
    username: clerkUsername,
  });
}
