import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { createClerkE2EAuthState } from './helpers/clerk-auth';
import { runE2ECredentialHealthCheck } from './helpers/credential-health-check';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { seedTestSubscription } from './helpers/seed-test-user';

setup('global setup', async ({ page }) => {
  await runE2ECredentialHealthCheck();
  await seedTestSubscription();
  await runE2EUserStateReset();
  await clerkSetup();
  await createClerkE2EAuthState(page);
});
