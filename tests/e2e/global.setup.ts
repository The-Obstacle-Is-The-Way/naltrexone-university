import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { runE2ECredentialHealthCheck } from './helpers/credential-health-check';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { seedTestSubscription } from './helpers/seed-test-user';

setup('global setup', async () => {
  await runE2ECredentialHealthCheck();
  await runE2EUserStateReset();
  await clerkSetup();
  await seedTestSubscription();
});
