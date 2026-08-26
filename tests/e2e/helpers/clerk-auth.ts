import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { clerk } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';
import { installE2ELogRedaction } from './e2e-log-redaction';

export const E2E_CLERK_AUTH_STATE_PATH = 'test-results/.auth/e2e-user.json';

export const clerkUsername = process.env.E2E_CLERK_USER_USERNAME;
export const clerkPassword = process.env.E2E_CLERK_USER_PASSWORD;
export const hasClerkCredentials = Boolean(clerkUsername && clerkPassword);

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

export async function releaseClerkE2ESession<
  TPage extends ClerkE2EPage,
>(input: { clerkDriver: ClerkE2EDriver<TPage>; page: TPage }): Promise<void> {
  await input.page.goto('/');
  await input.clerkDriver.load(input.page);
  if (!(await input.clerkDriver.hasActiveSession(input.page))) return;

  await input.clerkDriver.signOut(input.page);
  await input.clerkDriver.waitForSignedOut(input.page);
}

export async function requireStoredClerkE2ESession<
  TPage extends ClerkE2EPage,
>(input: { clerkDriver: ClerkE2EDriver<TPage>; page: TPage }): Promise<void> {
  await input.page.goto('/');
  await input.clerkDriver.load(input.page);
  if (await input.clerkDriver.hasActiveSession(input.page)) return;

  throw new Error(
    'Stored Clerk E2E session is unavailable; global setup must create it',
  );
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
  await requireStoredClerkE2ESession({
    clerkDriver: playwrightClerkDriver,
    page,
  });
}

export async function createClerkE2EAuthState(page: Page): Promise<void> {
  if (!clerkUsername || !clerkPassword) {
    throw new Error('Missing Clerk E2E credentials');
  }

  installE2ELogRedaction(console);
  await ensureClerkE2ESession({
    clerkDriver: playwrightClerkDriver,
    page,
    password: clerkPassword,
    username: clerkUsername,
  });
  await mkdir(dirname(E2E_CLERK_AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: E2E_CLERK_AUTH_STATE_PATH });
}

export async function signOutClerkE2ESession(page: Page): Promise<void> {
  installE2ELogRedaction(console);
  await releaseClerkE2ESession({
    clerkDriver: playwrightClerkDriver,
    page,
  });
}
