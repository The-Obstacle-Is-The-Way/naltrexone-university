import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

setup('clerk setup', async () => {
  await clerkSetup();
});
