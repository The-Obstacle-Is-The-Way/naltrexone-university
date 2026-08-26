import { rm } from 'node:fs/promises';
import { test as teardown } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signOutClerkE2ESession,
} from './helpers/clerk-auth';

teardown('global teardown', async ({ page }) => {
  try {
    await signOutClerkE2ESession(page);
  } finally {
    await rm(E2E_CLERK_AUTH_STATE_PATH, { force: true });
  }
});
