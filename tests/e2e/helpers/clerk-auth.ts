import { clerk } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';

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
