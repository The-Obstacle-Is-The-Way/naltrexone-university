import { rm } from 'node:fs/promises';
import { test as teardown } from '@playwright/test';
import { signOutClerkE2ESession } from './helpers/clerk-auth';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  withClerkE2EAuthStateIfPresent,
} from './helpers/clerk-auth-state';

teardown('global teardown', async ({ baseURL, browser }) => {
  try {
    await withClerkE2EAuthStateIfPresent(async (storageState) => {
      if (!baseURL) {
        throw new Error('Clerk E2E cleanup requires a configured base URL');
      }
      const context = await browser.newContext({ baseURL, storageState });
      try {
        const page = await context.newPage();
        await signOutClerkE2ESession(page);
      } finally {
        await context.close();
      }
    });
  } finally {
    await rm(E2E_CLERK_AUTH_STATE_PATH, { force: true });
  }
});
