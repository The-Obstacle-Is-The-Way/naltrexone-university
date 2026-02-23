import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { runE2ECredentialHealthCheck } from './helpers/credential-health-check';
import { seedTestSubscription } from './helpers/seed-test-user';

setup('global setup', async () => {
  await runE2ECredentialHealthCheck();
  await clerkSetup();
  await seedTestSubscription();
});
