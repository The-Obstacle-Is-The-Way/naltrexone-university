import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { seedTestSubscription } from './helpers/seed-test-user';

setup('clerk setup', async () => {
  await clerkSetup();
});

setup('seed test subscription', async () => {
  if (!process.env.E2E_CLERK_USER_USERNAME || !process.env.STRIPE_SECRET_KEY) {
    setup.skip();
    return;
  }
  await seedTestSubscription();
});
