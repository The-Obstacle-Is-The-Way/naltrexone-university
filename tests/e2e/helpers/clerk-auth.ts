import { clerk } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';
import { installE2ELogRedaction } from './e2e-log-redaction';

export const clerkUsername = process.env.E2E_CLERK_USER_USERNAME;
export const clerkPassword = process.env.E2E_CLERK_USER_PASSWORD;
export const hasClerkCredentials = Boolean(clerkUsername && clerkPassword);

type ClerkSessionWaitPage = {
  waitForFunction(predicate: () => boolean): Promise<unknown>;
};

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

export async function signInWithClerkPassword(page: Page): Promise<void> {
  if (!clerkUsername || !clerkPassword) {
    throw new Error('Missing Clerk E2E credentials');
  }

  // Clerk's route handler can warn after the page closes and includes the
  // development browser credential in its request URL. Keep the warning while
  // preventing that credential from entering local or hosted test logs.
  installE2ELogRedaction(console);
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: clerkUsername,
      password: clerkPassword,
    },
  });
  await waitForActiveClerkSession(page);
}
