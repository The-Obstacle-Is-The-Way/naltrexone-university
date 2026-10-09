import { rm } from 'node:fs/promises';
import { test as teardown } from '@playwright/test';
import { withTimeout } from '@/lib/with-timeout';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  E2E_CLERK_RESTORE_FAILURE_PATH,
  E2E_CLERK_SESSION_ID_PATH,
  withStoredClerkE2ESessionId,
} from './helpers/clerk-auth-state';
import { CLERK_SESSION_DEADLINES } from './helpers/clerk-session-deadlines';
import { revokeClerkE2ESession } from './helpers/clerk-session-revocation';
import { deleteE2ERunStripeCustomer } from './helpers/e2e-stripe-owner';

teardown('global teardown', async () => {
  try {
    // BUG-330: the stored session ends through Clerk's Backend API by its ID.
    // A browser restoring it could see no session while Clerk still held it
    // active, and a sign-out through the browser then left it live.
    await withStoredClerkE2ESessionId(async (sessionId) => {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (!secretKey) {
        throw new Error('Clerk E2E cleanup requires CLERK_SECRET_KEY');
      }
      await withTimeout(
        revokeClerkE2ESession({ sessionId, secretKey }),
        CLERK_SESSION_DEADLINES.signOutMs,
      ).catch((error: unknown) => {
        throw new Error('Revoking the stored Clerk E2E session failed', {
          cause: error,
        });
      });
    });
  } finally {
    await rm(E2E_CLERK_AUTH_STATE_PATH, { force: true });
    await rm(E2E_CLERK_SESSION_ID_PATH, { force: true });
    await rm(E2E_CLERK_RESTORE_FAILURE_PATH, { force: true });
    // DEBT-508: a CI run attempt's own Stripe customer goes with it.
    await deleteE2ERunStripeCustomer();
  }
});
