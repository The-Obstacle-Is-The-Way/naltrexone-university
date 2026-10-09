import { test as setup } from '@playwright/test';
import { createClerkE2EAuthState } from './helpers/clerk-auth';
import { reserveSessionBudget } from './helpers/clerk-session-deadlines';
import { runE2ECredentialHealthCheck } from './helpers/credential-health-check';
import { sweepE2EStripeCustomers } from './helpers/e2e-stripe-owner';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { seedTestSubscription } from './helpers/seed-test-user';

setup('global setup', async ({ page }, testInfo) => {
  const startedAt = Date.now();
  // DEBT-508: preflight's Clerk lookup is the run's only one; the seed and
  // every later reset reuse the user it verified.
  const { clerkUserId } = await runE2ECredentialHealthCheck();
  await sweepE2EStripeCustomers();
  await seedTestSubscription({ clerkUserId });
  await runE2EUserStateReset();
  // BUG-328: sign-in and a failed attempt's sign-out get their full deadlines,
  // however long preparation took.
  reserveSessionBudget(testInfo, startedAt);
  await createClerkE2EAuthState(page);
});
