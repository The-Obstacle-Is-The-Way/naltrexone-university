import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { createClerkE2EAuthState } from './helpers/clerk-auth';
import { reserveSessionBudget } from './helpers/clerk-session-deadlines';
import { runE2ECredentialHealthCheck } from './helpers/credential-health-check';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { seedTestSubscription } from './helpers/seed-test-user';

setup('global setup', async ({ page }, testInfo) => {
  const startedAt = Date.now();
  await runE2ECredentialHealthCheck();
  await seedTestSubscription();
  await runE2EUserStateReset();
  await clerkSetup();
  // BUG-328: sign-in and a failed attempt's sign-out get their full deadlines,
  // however long preparation took.
  reserveSessionBudget(testInfo, startedAt);
  await createClerkE2EAuthState(page);
});
